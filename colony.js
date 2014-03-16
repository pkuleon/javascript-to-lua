#!/usr/bin/env node

var fs = require('fs')
  , falafel = require('falafel');


/** 
 * Colonize
 */

var keywords = ['end', 'do', 'nil'];
var mask = ['undefined'];//['string', 'math']; //, 'print'];
var locals = ['this', 'global', 'Object', 'Array', 'Number', 'String', 'RegExp', 'Date', 'Math', 'JSON', 'require', 'console', 'sleep', 'null'];

function fixIdentifiers (str) {
  if (keywords.indexOf(str) > -1) {
    return '_K_' + str;
  }
  //return str.replace(/_/g, '__').replace(/\$/g, '_S');
  return str.replace(/\$/g, '_S');
}

function uniqueStrings (arr) {
  var o = {};
  arr.forEach(function (k) {
    o[k] = true;
  });
  return Object.keys(o);
}

function attachIdentifierToContext (id, node) {
  var name = fixIdentifiers(id.source());
  while (node = node.parent) {
    if (node.type == 'FunctionDeclaration' || node.type == 'Program' || node.type == 'FunctionExpression') {
      (node.identifiers || (node.identifiers = [])).push(name);
      node.identifiers = uniqueStrings(node.identifiers);
      return;
    }
  }
}

function truthy (node) {
  if (['!', '<', '<=', '>', '>=', '===', '!=', '!==', 'instanceof', 'in'].indexOf(node.operator) == -1) {
    node.update("_JS._truthy(" + node.source() + ")");
  }
  return node.source();
}

function objectToLuaTable (obj) {
  var r = '', a, value;
  var findObj = function(o){
    r += '{';
    a = [];
    for (var i in o){
      value = o[i];
      if (typeof value == 'object'){
        value=findObj(value);
      }else if (typeof value == 'string'){
        value = '"'+String(value)+'"';
      }else if (typeof value == 'number'){
        //
      }else{
        value = '"'+String(value)+'"';
      }
      a.push('["'+i+'"]='+value);
      //r += '["'+i+'"]='+value;
    }
    r += a.join(',') + '}';
  }
  findObj(obj);
  return r;
}

function colonizeContext (ids, node) {
  if (ids) {
    ids = ids.filter(function (id) {
      return id != 'arguments';
    });
  }
  node.update([
    // Variables
    ids && ids.length ? 'local ' + ids.join(', ') + ';' : '',
    // Hoist Functions
    node.body.filter(function (stat) {
      return stat.type == 'FunctionDeclaration';
    }).map(function (stat) {
      return stat.source();
    }).join('\n'),
    // Statements
    node.body.filter(function (stat) {
      return stat.type != 'FunctionDeclaration';
    }).map(function (stat) {
      return stat.source();
    }).join('\n')
  ].filter(function (n) {
    return n;
  }).join('\n'));
}

function getLoops (node) {
  var loops = [];
  var par = node;
  while (par = par.parent) {
    if (par.type == 'WhileStatement' || par.type == 'ForStatement' || par.type == 'TryStatement') {
      var parname = par.parent.type == 'LabeledStatement' ? par.parent.label.source() :'';
      loops.unshift([par.type, parname, node.usesContinue]);
    }
  }
  return loops;
}

var labels = [];
var loops = [];

function colonize (node) {
  
  switch (node.type) {
    case 'Identifier':
      if (node.source() == 'arguments' && node.parent.type != 'Property') {
        attachIdentifierToContext(node, node);
      }
      node.update(fixIdentifiers(node.source()));
      break;

    case 'AssignmentExpression':
    
      if (node.operator == '=') {
        //console.log('-----------------------');
        //console.log(node.right);
      }
      
      // +=, -=, etc.
      if (node.operator != '=') {
        if (node.operator == '|=') {
          node.right.update('_JS._bit.bor(' + node.left.source() + ', ' + node.right.source() + ')');
        } else {
          node.right.update(node.left.source() + ' ' + node.operator.substr(0, 1) + ' ' + node.right.source());
        }
        node.operator = '=';
      }
      // Used in another expression, assignments must be wrapped by a closure.
      if (node.parent.type != 'ExpressionStatement') {
        node.update('(function () local _r = ' + node.right.source() + '; ' + node.left.source() + ' = _r; return _r; end)()');
      } else {
        // Need to refresh thanks to += updating.
        node.update(node.left.source() + ' = ' + node.right.source());
      }
      break;

    case 'ThisExpression':
      break;  

    case 'UnaryExpression':
      if (node.operator == '!') {
        node.update('(not ' + node.argument.source() + ')');
      } else if (node.operator == 'typeof') {
        node.update('_JS._typeof(' + node.argument.source() + ')');
      } else if (node.operator == 'delete') {
        // TODO return true/false
        node.update(node.argument.source() + ' = nil');
      } else {
        node.update('(' + node.source() + ')');
      }
      break;

    case 'BinaryExpression':
      if (node.operator == '!==' || node.operator == '!=') {
        // TODO strict
        node.update('(' + node.left.source() + ' ~= ' + node.right.source() + ')');
      } else if (node.operator == '===') {
        // TODO strict
        node.update('(' + node.left.source() + ' == ' + node.right.source() + ')');
      } else if (node.operator == '<<') {
        node.update('_JS._bit.lshift(' + node.left.source() + ', ' + node.right.source() + ')');
      } else if (node.operator == '&') {
        node.update('_JS._bit.band(' + node.left.source() + ', ' + node.right.source() + ')');
      } else if (node.operator == '|') {
        node.update('_JS._bit.bor(' + node.left.source() + ', ' + node.right.source() + ')');
      } else if (node.operator == 'instanceof') {
        node.update('_JS._instanceof(' + node.left.source() + ', ' + node.right.source() + ')');
      } else {
        node.update('(' + node.source() + ')');
      }
      break;

    case 'LogicalExpression':
      if (node.operator == '&&') {
        node.update(node.left.source() + ' and ' + node.right.source());
      } else if (node.operator == '||') {
        node.update(node.left.source() + ' or ' + node.right.source());
      }

      // Can't have and/or be statements.
      if (node.parent.type == 'ExpressionStatement') {
        node.update('if ' + node.source() + ' then end');
      }
      break;

    case 'UpdateExpression':
      // ++ or --
      if (node.prefix) {
        node.update('(function () ' + node.argument.source() + ' = ' + node.argument.source() + ' ' + node.operator.substr(0, 1) + ' 1; return ' + node.argument.source() + '; end)()');
      } else {
        node.update('(function () local _r = ' + node.argument.source() + '; ' + node.argument.source() + ' = _r ' + node.operator.substr(0, 1) + ' 1; return _r end)()');
      }
      break;

    case 'NewExpression':
      node.update("_JS._new(" +
        [node.callee.source()].concat(node.arguments.map(function (arg) {
          return arg.source();
        })).join(', ') + ")");
      break;

    case 'VariableDeclarator':
      attachIdentifierToContext(node.id, node);
      break;

    case 'VariableDeclaration':
      node.update(node.declarations.map(function (d) {
        return d.id.source();
      }).join(', ') + ' = ' + node.declarations.map(function (d) {
        return d.init ? d.init.source() : 'nil'
      }).join(', ') + ';');
      break;

    case 'BreakStatement':
      //TODO _c down the stack is false until the main one
      //label = label or (x for x in loops when loops[0] != 'try')[-1..][0]?[1] or ""

      var label = node.label ? node.label.source() : '';

      node.update("_c" + label + " = _JS._break; " +
        ((getLoops(node).slice(-1)[0] || [])[0] == "TryStatement" ? "return _JS._break;" : "break;"));
      break;

    case 'SwitchCase':
      break;
    case 'SwitchStatement':
      node.update([
        'repeat',
        node.cases.map(function (c, i) {
          return 'local _' + i + (c.test ? ' = ' + c.test.source() : '') + ';'
        }).join(' '),
        'local _r = ' + node.discriminant.source() + ';',
        node.cases.map(function (c, i) {
          if (!c.test) {
            return c.consequent.map(function (s) {
              return s.source();
            }).join('\n')
          }
          return 'if _r == _' + i + ' then\n' + c.consequent.map(function (s) {
            return s.source();
          }).join('\n') + '\n' + (i < node.cases.length - 1 && (c.consequent.slice(-1)[0] || {}).type != 'BreakStatement' ? '_r = _' + (i + 1) + ';\n' : '') + 'end'
        }).join('\n'),
        'until true'
      ].join('\n'))
// ret = "repeat\n" +
//   (if cases.length then ("local _#{i}#{if v then ' = ' + colonize(v) else ''}; " for i, [v, _] of cases).join('') else '') +
//   "local _r = #{colonize(expr)};\n" +
//   (for i, [_, stats] of cases
//     if _?
//       "if _r == _#{i} then\n" + (colonize(x) for x in stats).concat(if cases[Number(i)+1] and (not stats.length or stats[-1..][0].type != "break-stat") then ["_r = _#{Number(i)+1};"] else []).join("\n") + "\nend"
//     else
//       (colonize(x) for x in stats).join("\n")
//   ).join("\n") + "\n" +
//   "until true"
// loops.pop()
      break;


    case 'ContinueStatement':
      //TODO _c down the stack is false until the main one
      //label = label or (x for x in loops when loops[0] != 'try')[-1..][0]?[1] or ""

      var label = node.label ? node.label.source() : '';

      var par = node;
      while (par = par.parent) {
        if (par.type == 'WhileStatement' || par.type == 'ForStatement') {
          par.usesContinue = true;
        }
      }
      node.update("_c" + label + " = _JS._cont; " +
        ((getLoops(node).slice(-1)[0] || [])[0] == "TryStatement" ? "return _JS._cont;" : "break;"));
      break;

    case 'DoWhileStatement':
      var name = node.parent.type == 'LabeledStatement' ? node.parent.label.source() :'';

      var loops = getLoops(node);
      var ascend = loops.filter(function (l) {
        return l[0] != 'TryStatement' && l[1] != null;
      }).map(function (l) {
        return l[1];
      });

      node.update([
        'repeat',
        (node.usesContinue ? 'local _c' + name + ' = nil; repeat' : ''),
        node.body.source(),
        (node.usesContinue ? 'until true;\nif _c' + name + ' == _JS._break' + [''].concat(ascend).join(' or _c') + ' then break end' : ''),
        'until not ' + truthy(node.test) + ';'
      ].join('\n'))
      break;

    case 'WhileStatement':
      var name = node.parent.type == 'LabeledStatement' ? node.parent.label.source() :'';

      var loops = getLoops(node);
      var ascend = loops.filter(function (l) {
        return l[0] != 'TryStatement' && l[1] != null;
      }).map(function (l) {
        return l[1];
      });

      node.update([
        'while ' + truthy(node.test) + ' do',
        (node.usesContinue ? 'local _c' + name + ' = nil; repeat' : ''),
        node.body.source(),
        (node.usesContinue ? 'until true;\nif _c' + name + ' == _JS._break' + [''].concat(ascend).join(' or _c') + ' then break end' : ''),
        'end'
      ].join('\n'))
      break;

    case 'ForStatement':
      node.update([
        node.init ? node.init.source() : '',
        'while ' + (node.test ? truthy(node.test) : 'true') + ' do',
        (node.usesContinue ? 'local _c = nil; repeat' : ''),
        node.body.source(),
        (node.usesContinue ? 'until true;\nif _c == _JS._break then break end' : ''),
        node.update ? node.update.source() : '',
        'end'
      ].join('\n'))
      break;
    case 'RegularExpression':
        console.log(2222)
        break;
    case 'Literal':
      //if (node.type == 'RegularExpression'){
      if (Object.prototype.toString.call(node.value).slice(8,-1) == 'RegExp'){
        //node.update('_JS.Regexp("' + node.value + '")');
        //node.update('_JS._new(RegExp, _JS._regexp("' +node.value+ '"))');
        var r = String(node.value),
            s = r.indexOf('/'),
            e = r.lastIndexOf('/'),
            r_pat = r.substr(s,e),
            r_flag = r.substr(e, r.length)
        ;
        node.update('_JS._new(RegExp, ("' +node.value+ '"))');
        //node.update('_JS._new(RegExp, ([[' +r_pat+ ']], "' +r_flag+ '"))');
        //node.update('"' + node.value + '"');
      }else{
        /////////console.log(node);
        node.update('(' + JSON.stringify(node.value) + ')');
      }
      break;

    case 'CallExpression':
      if (node.callee.type == 'MemberExpression') {
        // console.log add a void string "" to params for avoid the rear of array is a nil value
        if (node.callee.object.source() == 'console' && node.callee.property.source() == 'log'){
          node.update(node.callee.object.source() + ':'
            + node.callee.property.source()
            + '(' + node.arguments.map(function (arg) {
            return arg.source()
          }).concat(['""']).join(', ') + ')')
        }else{
          // Method call
          node.update(node.callee.object.source() + ':'
            + node.callee.property.source()
            // + '[' + (node.callee.property.type == 'Identifier' ? JSON.stringify(node.callee.property.source()) : node.callee.property.source()) + ']'
            + '(' + node.arguments.map(function (arg) {
            return arg.source()
          }).join(', ') + ')')
        }
      } else {
        node.update(node.callee.source() + '(' + ['global'].concat(node.arguments.map(function (arg) {
        //node.update(node.callee.source() + '(' + node.arguments.map(function (arg) {
          return (arg.source && arg.source()) || arg;
          //return arg.source()
        })).join(', ') + ')')
      }
      break;

    case 'ObjectExpression':
      node.update('_JS._obj({\n  ' +
        node.properties.map(function (prop) {
          return '[' + JSON.stringify(prop.key.type == 'Identifier' ? prop.key.name : prop.key.value) + ']=' + prop.value.source()
        }).join(',\n  ') +
        '})');
      // to lua's table
      //node.update('_JS._obj(' +node.source().replace(/\((.*?)\):\((.*?)\)/g, '[$1]=$2')+ ')')
      //node.update('_JS._obj(' +objectToLuaTable(JSON.parse(node.source()))+ ')')
      break;
    case 'Property':
      break;

    case 'ArrayExpression':
      if (!node.elements.length) {
        node.update("_JS._arr({})");
      } else {
        node.update("_JS._arr({[0]=" + [].concat(node.elements.map(function (el) {
          return el.source();
        })).join(', ') + "})");
      }
      break;

    case 'ConditionalExpression':
      node.update('(' + truthy(node.test) + ' and {' + node.consequent.source() + '} or {' + node.alternate.source() + '})[1]');
      break;

    case 'IfStatement':
      node.update([
        "if " + truthy(node.test) + " then\n",
        node.consequent.source() + '\n',
        (node.alternate ? 'else\n' + node.alternate.source() + '\n' : ""),
        "end"
      ].join(''));
      break;

    case 'ReturnStatement':
      // Wrap in conditional to allow returns to precede statements
      node.update("if true then return" + (node.argument ? ' ' + node.argument.source() : '') + "; end;");
      break;

    case 'BlockStatement':
      colonizeContext(node.parent.type == 'FunctionDeclaration' || node.parent.type == 'FunctionExpression' ? node.parent.identifiers : [], node);
      break;

    case 'MemberExpression':
      if (!node.parent.type == 'CallExpression') {
        node.update("(" + node.object.source() + ")"
          + '[' + (node.property.type == 'Identifier' ? JSON.stringify(node.property.source()) : node.property.source()) + ']');
      }
      break;

    case 'ExpressionStatement':
      node.update(node.source().replace(/;?$/, ';')); // Enforce trailing semicolons.

      // Can't have and/or be statements.
      if (node.expression.type == 'BinaryExpression' || node.expression.type == 'Literal' || node.expression.type == 'CallExpression') {
        node.update('if ' + node.source().replace(/;?$/, '') + ' then end;');
      }
      break;

    case 'LabeledStatement':
      // TODO change stat to do { } while(false) unless of certain type;
      // this makes this labels array work
      node.update(node.body.source());
      break;

    case 'ForInStatement':
      if (node.left.type == 'VariableDeclaration') {
        var name = fixIdentifiers(node.left.declarations[0].id.name);
      } else {
        var name = node.left.source();
      }
      node.update([
        'for ' + name + ' in pairs(' + node.right.source() + ') do',
        node.body.source(),
        'end'
      ].join('\n'))
      break;

    case 'ThrowStatement':
      node.update("error(" + node.argument.source() + ")");
      break;

    case 'CatchClause':
      break;

    case 'TryStatement':
      node.update([
'local _e = nil',
'local _s, _r = xpcall(function ()',
node.block.source(),
//    #{if tryStat.stats[-1..][0].type != 'ret-stat' then "return _JS._cont" else ""}
'    end, function (err)',
'        _e = err',
'    end)',

// catch clause
'if _s == false then',
node.handlers[0].param.source() + ' = _e;\n' + node.handlers[0].body.source(),

// break clause.
'end',
node.finalizer ? node.finalizer.source() : ''
].concat(
!getLoops(node).length ? [] : [
//break
'if _r == _JS._break then',
(getLoops(node).length && getLoops(node).slice(-1)[0][0] == 'TryStatement' ? 'return _JS._break;' : 'break;'),
// continue clause.
'elseif _r == _JS._cont then',
//'  return _r',
(getLoops(node).length && getLoops(node).slice(-1)[0][0] == 'TryStatement' ? 'return _JS._cont;' : 'break;'),
'end'
      ]).join('\n'));
      break;

    case 'FunctionExpression':
    case 'FunctionDeclaration':
      if (node.id && !node.expression) {
        attachIdentifierToContext(node.id, node);
      }

      node.identifiers || (node.identifiers = []);

      // fix references
      var name = node.id && node.id.source();
      var args = node.params.map(function (arg) {
        return arg.source();
      });

      // expression prefix/suffix
      if (!node.expression && node.parent.type != 'CallExpression' && name) {
        // TODO among other types of expressions...
        var prefix = name + ' = ', suffix = ';';
      } else {
        var prefix = '', suffix = '';
      }

      // assign self-named function reference only when necessary
      var namestr = "";
      if (node.identifiers.indexOf(name) > -1) {
        namestr = "local " + name + " = debug.getinfo(1, 'f').func;\n";
      }

      var loopsbkp = loops;
      var loops = [];
      if (node.identifiers.indexOf('arguments') > -1) {
        node.update(prefix + "_JS._func(function (this, ...)\n" + namestr +
          "local arguments = _JS._arr((function (...) return arg; end)(...)); arguments:shift();\n" +
          (args.length ? "local " + args.join(', ') + " = ...;\n" : "") +
          node.body.source() + "\n" +
          "end)" + suffix);
      } else {
        node.update(prefix + "_JS._func(function (" + ['this'].concat(args).join(', ') + ")\n" + namestr +
          node.body.source() + "\n" +
          "end)" + suffix);
      }

      loops = loopsbkp;
      break;

    case 'Program':
      colonizeContext(node.identifiers, node);
      node.update([
        "local _JS = require('colony-lib');",
        "local " + mask.join(', ') + ' = ' + mask.map(function () { return 'nil'; }).join(', ') + ';',
        "local " + locals.join(', ') + ' = ' + locals.map(function (k) { return '_JS.' + k; }).join(', ') + ';',
        "local _module = {exports={}}; local exports = _module.exports;",
        "",
        node.source(),
        "",
        "return _module.exports;"
      ].join('\n'));
      break;

    default:
      //console.log(node.type.red, node);
  }
}


/**
 * Output
 */

if (process.argv.length < 3) {
  console.error('Usage: node colony filepath.js');
  process.exit(1);
}

/* 
    This function is loosely based on the one found here:
    http://www.weanswer.it/blog/optimize-css-javascript-remove-comments-php/
*/
function removeComments(str) {
    str = ('__' + str + '__').split('');
    var mode = {
        singleQuote: false,
        doubleQuote: false,
        regex: false,
        blockComment: false,
        lineComment: false,
        condComp: false 
    };
    for (var i = 0, l = str.length; i < l; i++) {
 
        if (mode.regex) {
            if (str[i] === '/' && str[i-1] !== '\\') {
                mode.regex = false;
            }
            continue;
        }
 
        if (mode.singleQuote) {
            if (str[i] === "'" && str[i-1] !== '\\') {
                mode.singleQuote = false;
            }
            continue;
        }
 
        if (mode.doubleQuote) {
            if (str[i] === '"' && str[i-1] !== '\\') {
                mode.doubleQuote = false;
            }
            continue;
        }
 
        if (mode.blockComment) {
            if (str[i] === '*' && str[i+1] === '/') {
                str[i+1] = '';
                mode.blockComment = false;
            }
            str[i] = '';
            continue;
        }
 
        if (mode.lineComment) {
            if (str[i+1] === '\n' || str[i+1] === '\r') {
                mode.lineComment = false;
            }
            str[i] = '';
            continue;
        }
 
        if (mode.condComp) {
            if (str[i-2] === '@' && str[i-1] === '*' && str[i] === '/') {
                mode.condComp = false;
            }
            continue;
        }
 
        mode.doubleQuote = str[i] === '"';
        mode.singleQuote = str[i] === "'";
 
        if (str[i] === '/') {
 
            if (str[i+1] === '*' && str[i+2] === '@') {
                mode.condComp = true;
                continue;
            }
            if (str[i+1] === '*') {
                str[i] = '';
                mode.blockComment = true;
                continue;
            }
            if (str[i+1] === '/') {
                str[i] = '';
                mode.lineComment = true;
                continue;
            }
            mode.regex = true;
 
        }
 
    }
    return str.join('').slice(2, -2);
}

function to_lua_file(src_path, rename_path, is_print_source){
  if (!fs.existsSync(src_path)){
    console.error('"'+src_path+'"', 'is not exists.');
    return;
  }
  
  try{
  var src = fs.readFileSync(src_path, 'utf-8'), 
    out = falafel(src, colonize);
    
  var filename = src_path.substr(0, src_path.lastIndexOf('.')),
    out_path = rename_path ? rename_path : (filename + '.lua');

  //out = String(out).replace(/\/\*/g, '--[[').replace(/\*\//g, ']]--').replace(/\/\//g, '--');
  out = removeComments(String(out));//.replace(/\/\//g, '--');
  
  if (is_print_source) {
    console.log(out);
  }

  fs.writeFile(out_path, out, 'utf-8');
  }catch(e){ console.error('SyntaxError on', '"'+src_path+'"' , '\n', e) }
}

function walk(path){  
  var list = fs.readdirSync(path);
  list.forEach(function(item){
    if(fs.statSync(path + '/' + item).isDirectory() && item.substr(0,1) != '.'){
      walk(path + '/' + item);
    }else if(item.substr(item.lastIndexOf('.'), item.length) == '.lua' || item.substr(0,1) == '.'){
      //please ignore the .lua file
    }else{
      to_lua_file(path + '/' + item, null);
      console.log('DONE -- ' , path + '/' + item);
    }
  });
}


try{

  var src_path = process.argv[2],
    out_path = process.argv[3];
  
  if (!fs.statSync(src_path).isDirectory()){
    to_lua_file(src_path, out_path, true);
  }else{
    walk(src_path);
  }
  
  
}catch(e){ console.log('ERROR/n', e); }
