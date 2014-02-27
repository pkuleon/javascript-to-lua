--[[
References:
  https://github.com/mirven/underscore.lua/blob/master/lib/underscore.lua
  https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/String/slice
]]--

-- namespace

local _JS = {}

-- built-in prototypes

local obj_proto, func_proto, bool_proto, num_proto, str_proto, arr_proto, regex_proto, date_proto = {}, {}, {}, {}, {}, {}, {}, {}

-- introduce metatables to built-in types using debug library:
-- this can cause conflicts with other modules if they utilize the string prototype
-- (or expect number/booleans to have metatables)

local func_mt, str_mt, nil_mt = {}, {}, {}
debug.setmetatable((function () end), func_mt)
debug.setmetatable(true, {__index=bool_proto})
debug.setmetatable(0, {__index=num_proto})
debug.setmetatable("", str_mt)
debug.setmetatable(nil, nil_mt)


local f, rex = pcall(require, "rex_pcre")
local cjson = pcall(require, "cjson")


-- nil metatable

nil_mt.__eq = function (op1, op2)
    return op2 == nil
end

nil_mt.__gt = function (op1, op2)
    return op2 == nil
end

nil_mt.__lt = function (op1, op2)
    return op2 == nil
end

-- object prototype and constructor

_JS._obj = function (o)
    local mt = getmetatable(o) or {}
    mt.__index = obj_proto
    
 
 --[[
    mt.__index = function(self, key) 
        -- read only
        if rawget(obj_proto, key) then
            return rawget(obj_proto, key)
        elseif rawget(self, "get__" .. key) then
            return (rawget(self, "get__" .. key))(obj_proto)
        else
            return rawget(self, key)
        end
    end
           
    mt.__newindex = function(self, key, value) 
        if rawget(self, "set__" .. key) then
            
            local fn = rawget(self, "set__" .. key)
            fn(self, value)
        else
            rawset(self, key, value) 
        end
    end
--]]
    setmetatable(o, mt)
    
    return o
end

-- all prototypes inherit from object

_JS._obj(func_proto)
_JS._obj(num_proto)
_JS._obj(bool_proto)
_JS._obj(str_proto)
_JS._obj(arr_proto)
_JS._obj(regex_proto)
_JS._obj(date_proto)

-- function constructor

_JS._func = function (f)
    f.prototype = _JS._obj({})
    return f
end
local luafunctor = function (f)
    return (function (this, ...) return f(...) end)
end

func_mt.__index=function (t, p)
    if getmetatable(t)[t] and getmetatable(t)[t][p] ~= nil then
        return getmetatable(t)[t][p]
    end
    return func_proto[p]
end
func_mt.__newindex=function (t, p, v)
    local pt = getmetatable(t)[t] or {}
    pt[p] = v
    getmetatable(t)[t] = pt
end

-- string metatable

str_mt.__index = function (str, p)
    if (p == "length") then
        return string.len(str)
    elseif (tonumber(p) == p) then
        return string.sub(str, p+1, p+1)
    else
        return str_proto[p]
    end
end

str_mt.__add = function (op1, op2)
    return op1 .. op2
end

-- array prototype and constructor

local arr_mt = {
    __index = function (arr, p)
        if (p == "length") then
            if arr[0] then return table.getn(arr) + 1 end
            return table.getn(arr)
        else
            return arr_proto[p]
        end
    end
}
_JS._arr = function (a)
    setmetatable(a, arr_mt)
    return a
end

-- void function for expression statements (which lua disallows)

_JS._void = function () end

-- null object (nil is "undefined")
-- _JS._null = {}
_JS.null = nil

-- "add" function to rectify lua's distinction of adding vs concatenation

_JS._add = function (a, b)
    if type(a) == "string" or type(b) == "string" then
        return a .. b
    else
        return a + b
    end
end

-- typeof operator

_JS._typeof = function (t)
    local r = type(t)
    if tostring(r) == 'table' then return 'object' end
    if tostring(r) == 'nil' then return 'undefined' end
    return r
end
-- instanceof

_JS._instanceof = function ()
    return true
end

-- "new" invocation

_JS._new = function (f, ...)
    local o = {}
    setmetatable(o, {__index=f.prototype})
    local r = f(o, ...)
    if r then return r end
    return o
end

--[[
Standard Library
]]--

-- number prototype
num_proto.constructor = {}
num_proto.constructor.name = "Number"
num_proto.toString = function (ths)
    return tostring(ths)
end
num_proto.toFixed = function (num, n)
    return string.format("%." .. n .. "f", num)
end

-- string prototype
str_proto.constructor = {}
str_proto.constructor.name = "String"
str_proto.toString = function (ths)
    return tostring(ths)
end
str_proto.charCodeAt = function (str, i, a)
    return string.byte(str, i+1)
end
str_proto.charAt = function (str, i)
    return string.sub(str, i+1, i+1)
end
str_proto.substr = function (str, i)
    return string.sub(str, i+1)
end
str_proto.slice = function (str, i)
    return string.sub(str, i+1)
end
str_proto.toLowerCase = function (str)
    return string.lower(str)
end
str_proto.toUpperCase = function (str)
    return string.upper(str)
end
str_proto.indexOf = function (str, needle)
    local ret = string.find(str, needle, 1, true) 
    if ret == null then return -1; else return ret - 1; end
end
str_proto.lastIndexOf = function(str, s, i)
	if s=="." then s="%." end
	if i==nil then i=0 end
	local n=-1
	repeat
		i=str_proto.indexOf(str,s,i)
		if i>-1 then n=i end
		i=i+1
	until i<=0
	return n
end
str_proto.split = function (str, sep, max)
    if sep == '' then return _JS._arr({}) end

    local ret = {}
    if string.len(str) > 0 then
        max = max or -1

        local i, start=1, 1
        local first, last = string.find(str, sep, start, true)
        while first and max ~= 0 do
            ret[i] = string.sub(str, start, first-1)
            i, start = i+1, last+1
            first, last = string.find(str, sep, start, true)
            max = max-1
        end
        ret[i] = string.sub(str, start)
    end
    return _JS._arr(ret)
end
str_proto.match = function (ths, str)
    if (t.constructor and t.constructor.name == "RegExp") then
        return t.rex.gsub(ths, str, str2)
    else
        return string.gsub(ths, str, str2)
    end
end
str_proto.replace = function (ths, str, str2)
    if (str.constructor and str.constructor.name == "RegExp") then
        -- print('------   ', rex.gsub('{("name"):("a"),("desc"):(2)}', "\\((.*?)\\):\\((.*?)\\)", '[$1]=$2'))
        
        return rex.gsub(ths, tostring(str.source), str2)
    else
        return string.gsub(ths, str, str2)
    end
end

-- object prototype
obj_proto.constructor = {}
obj_proto.constructor.name = "Object"
obj_proto.toString = function (ths)
    return "[object Object]" --require('json').parse(p)
end
obj_proto.toString.call = function (ths, t)
    -- get javascript type
    if (t.constructor and t.constructor.name) then
        return "[object " .. t.constructor.name .. "]"
    end
    
    -- get lua type
    local r = type(t)
    if tostring(r) == "boolean" then return "[object Boolean]" end
    if tostring(r) == "function" then return "[object Function]" end
    if tostring(r) == "string" then return "[object String]" end
    if tostring(r) == "number" then return "[object Number]" end
    if tostring(r) == "userdata" then return "[object Object]" end
    if tostring(r) == "table" then
        if (t.length and t.slice and t.push and t.pop) then 
            return "[object Array]"
        else
            return "[object Object]"
        end
    end
    if tostring(r) == "nil" then return "[object Undefined]" end
    return r
end
obj_proto.hasInstance = function (ths, p)
    return toboolean(rawget(ths, p))
end
obj_proto.hasOwnProperty = function (ths, p)
    return rawget(ths, p) ~= nil
end
obj_proto.__defineAttribute__ = function(ths, n)
    --[[
    if rawget(ths, tostring(n)) == nil then
        rawset(ths, tostring(n), function(this, s)
            local _set_ = rawget(ths, "set__" + tostring(n))
            local _get_ = rawget(ths, "get__" + tostring(n))
            --if arg ~= nil and #arg > 0 then
            if s ~= nil then
                if _set_ ~= nil then return _set_(this, s) end
            else
                if _get_ ~= nil then return _get_(this, s) end
            end 
        end)
    end
    --]]
end
obj_proto.__defineGetter__ = function(ths, n, fn)
    rawset(ths, "get__" + tostring(n), fn)
    --obj_proto.__defineAttribute__(ths, n)
end
obj_proto.__defineSetter__ = function(ths, n, fn)
    rawset(ths, "set__" + tostring(n), fn)
    --obj_proto.__defineAttribute__(ths, n)
end

--[[
setmetatable(obj_proto, { 
        __index = function(self, key) 
            
            local _get_ = rawget(obj_proto, "get__" + tostring(key))
            print(key, "was looked up")
            if _get_ == nil then
                return rawget(obj_proto, key) 
            else
                return _get_(key)
            end
        end,
        
        __newindex = function(self, key, value) 
            local _set_ = rawget(obj_proto, "set__" + tostring(key))
            print(key, "was set to", value) 
            if _set_ == nil then
                rawset(obj_proto, key, value)
            else
                _set_(value)
            end
        end, 
    })
--]]

-- function prototype
func_proto.constructor = {}
func_proto.constructor.name = "Function"
func_proto.call = function (func, ths, ...)
    return func(ths, ...)
end
func_proto.apply = function (func, ths, args)
    -- copy args to new args array
    local luargs = {}
    for i=0,args.length-1 do luargs[i+1] = args[i] end
    return func(ths, unpack(luargs))
end

-- array prototype
arr_proto.constructor = {}
arr_proto.constructor.name = "Array"
arr_proto.toString = function (ths)
    local r = ''
    local v = ''
    for i=0,ths.length-1 do
        if i < ths.length-1 then
            r = r .. tostring(ths[i]) .. ","
        else
            r = r .. tostring(ths[i])
        end
    end
    return "[" .. r .. "]"
end
arr_proto.push = function (ths, elem)
  table.insert(ths, ths.length, elem)
  return ths.length
end
arr_proto.pop = function (ths)
    return table.remove(ths, ths.length-1)
end
arr_proto.shift = function (ths)
    local ret = ths[0]
    ths[0] = table.remove(ths, 1)
    return ret
end
arr_proto.unshift = function (ths, elem)
    return table.insert(ths, 0, elem)
end
arr_proto.reverse = function (ths)
    local arr = _JS._arr({})
    for i=0,ths.length-1 do
        arr[ths.length - 1 - i] = ths[i]
    end
    return arr
end
arr_proto.slice = function (ths, len)
    local a = _JS._arr({})
    for i=len or 0,ths.length-1 do
        a:push(ths[i])
    end
    return a
end
arr_proto.concat = function (src1, src2)
    local a = _JS._arr({})
    for i=0,src1.length-1 do
        a:push(src1[i])
    end
    for i=0,src2.length-1 do
        a:push(src2[i])
    end
    return a
end
arr_proto.join = function (ths, str)
    local _r = ""
    if str == nil then
        str = ","
    end
    for i=0,ths.length-1 do
        if not ths[i] or ths[i] == _null then _r = _r .. str
        else _r = _r .. ths[i] .. str end
    end
    return string.sub(_r, 1, string.len(_r) - string.len(str))
end

--[[
Globals
]]--

_JS.this, _JS.global = _G, _G

-- Object

_JS.Object = {}
_JS.Object.prototype = obj_proto

-- Array

_JS.Array = luafunctor(function (one, ...)
    if #arg > 0 or type(one) ~= 'number' then
        arg[0] = one
        return _JS._arr(arg)
    elseif one ~= nil then
        local a = {}
        for i=0,tonumber(one)-1 do a[i]=null end
        return _JS._arr(a)
    end
    return _JS._arr({})
end)
_JS.Array.prototype = arr_proto
_JS.Array.isArray = luafunctor(function (a)
    return (getmetatable(a) or {}) == arr_mt
end)

-- Number

_JS.Number = luafunctor(function (str)
    return tonumber(str)
end)
_JS.Number.prototype = num_proto

-- String

_JS.String = luafunctor(function (str)
    return tostring(str)
end)
_JS.String.prototype = str_proto
_JS.String.fromCharCode = luafunctor(function (c)
    return string.char(c)
end)

-- Math
_JS.Math = _JS._obj({
    PI = tonumber(math.pi),
    min = luafunctor(math.min),
    max = luafunctor(math.max),
    random = luafunctor(math.random),
    floor = luafunctor(math.floor),
    ceil = luafunctor(math.ceil),
    abs = luafunctor(math.abs),
    sqrt = luafunctor(math.sqrt),
    pow = luafunctor(math.pow),
    sin = luafunctor(math.sin),
    cos = luafunctor(math.cos),
    asin = luafunctor(math.asin),
    acos = luafunctor(math.acos),
    tan = luafunctor(math.tan),
    atan = luafunctor(math.atan),
    round = luafunctor(function (v)
        return math.floor(v+0.5)
    end)
})

-- JSON
_JS.JSON = _JS._obj({
    stringify = luafunctor(function(var)
        local status, result = pcall(cjson.encode, var)
        if status then return result end
        print("JSON.stringify() - failed: ".. tostring(result))
    end),
    parse = luafunctor(function(text)
        local status, result = pcall(cjson.decode, text)
        if status then return result end
        print("JSON.parse() - failed: ".. tostring(result))
    end),
})

-- Console

_JS.console = _JS._obj({
--[[
    log = luafunctor(function (x)
        if x == nil then 
            print("undefined")
        elseif x == null then
            print("null")
        else
            print(x)
        end
    end)
    --]]--
    
    log = luafunctor(function(...)
        local arg = {...}
        local str = ""
        if #arg==0 then str="nil" end
        for i=1,#arg do
            if arg[i] == nil then
                str=str.."undefined".."" --"\t"
            elseif arg[i] == _JS.null then
                str=str.."null" --"\t"
            elseif type(arg[i])=="table" or type(arg[i])=="userdata" then
                str=str.."[object Object]" --"\t"
            elseif type(arg[i])=="function" then
                str=str.."[object Function]" --"\t"
            else
                str=str..tostring(arg[i]) --"\t"
            end
            if i<#arg then str=str.." " end
        end
        print(str)
    end)
});

-- break/cont flags

_JS._break = {}; _JS._cont = {}

-- truthy values

_JS._truthy = function (o)
    return o and o ~= 0 and o ~= ""
end

-- require function

_JS.require = luafunctor(require)

-- bitop library

_JS._bit = require('bit')

-- regexp library

--if f then
regex_proto.constructor = {}
regex_proto.constructor.name = "RegExp"
regex_proto.toString = _JS._func(function(this)
    return tostring(this.source)
end)

_JS.RegExp = _JS._func(function (this, s)
    this.source = s
    this.pattern = rex.new(tostring(s))
;
end);
_JS.RegExp.prototype = regex_proto
--[[
    regex_proto.constructor = {}
    regex_proto.constructor.name = "RegExp"
        
    _JS._regexp = function (o)
        local mt = debug.getmetatable(o) or {}
        debug.setmetatable(o, mt)
        return o
    end
    
    _JS.Regexp = luafunctor(function (pat, flags)
        local r = rex.new(tostring(pat))
        --debug.setmetatable(r, regex_proto)
        return  _JS._regexp(r)
        --return r
    end)
    _JS.Regexp.prototype = regex_proto
--end
--]]


-- http://www.lua.org/pil/22.1.html
date_proto.constructor = {}
date_proto.constructor.name = "Date"
date_proto.getTime = _JS._func(function (this)
    return this.datetime*1e3
end)
date_proto.setTime = _JS._func(function (this, t)
    this.datetime = t
end)
date_proto.getFullYear = _JS._func(function (this, t)
    return tonumber(os.date(("%Y"), this.datetime))
end)
date_proto.getMonth = _JS._func(function (this, t)
    return tonumber(os.date(("%m"), this.datetime))
end)
date_proto.getDate = _JS._func(function (this, t)
    return tonumber(os.date(("%d"), this.datetime))
end)
date_proto.getDay = _JS._func(function (this, t)
    return tonumber(os.date(("%w"), this.datetime))
end)
date_proto.getHours = _JS._func(function (this, t)
    return tonumber(os.date(("%H"), this.datetime))
end)
date_proto.getMinutes = _JS._func(function (this, t)
    return tonumber(os.date(("%M"), this.datetime))
end)
date_proto.getSeconds = _JS._func(function (this, t)
    return tonumber(os.date(("%S"), this.datetime))
end)
date_proto.toString = _JS._func(function (this, t)
    --os.date("%x", 906000490)
    return tostring(os.date(('%a %b %d %Y %H:%M:%S'), this.datetime))
end)
date_proto.toGMTString = _JS._func(function (this, t)
    return tostring(os.date(("%a, %d %b %Y %T GMT"), this.datetime))
end)

_JS.Date = _JS._func(function (this, t)
    this.datetime = 0;
    if t == nil then
        this.datetime = os.time()
    else
        this.datetime = math.modf(t/1e3)
    end
    --return this.datetime
end)
_JS.Date.prototype = date_proto


-- https://github.com/ignacio/LuaNode/blob/master/lib/luanode/timers.lua
-- Timer
-- local Timer = process.Timer
-- function setInterval(callback, repeat_, ...)
    -- assert(callback, "A callback function must be supplied")
    -- local timer = Timer()
    -- if select("#", ...) > 0 then
        -- local args = {...}
        -- timer.callback = function()
            -- callback(unpack(args))
        -- end
    -- else
        -- timer.callback = callback
    -- end
    -- timer:start(repeat_, repeat_ and repeat_ or 1)
    -- return timer
-- end

-- function clearInterval (timer)
    -- timer.callback = nil
    -- timer:stop()
-- end

_JS.sleep = function(sec)
    -- local sk = require("socket")
    -- sk.select(nil, nil, sec / 1e3)
    local n = sec / 1e3
    if n > 0 then os.execute("ping -n " .. tonumber(n+1) .. " localhost > NUL") end
end

_JS.setInterval = function(callback, times, ...)
    local timer = function ()
        
    end
    timer.callback = callback
    return timer
end
_JS.clearInterval = function(timer)
    --TODO: assert(timer es un timer posta)
    timer.callback = nil
    timer = nil
end

-- require 'socket' -- for having a sleep function ( could also use os.execute(sleep 10))
-- function abc()
    -- local timer = function (time)
        -- local init = os.time()
        -- local diff=os.difftime(os.time(),init)
        -- while diff<time do
            -- coroutine.yield(diff)
            -- diff=os.difftime(os.time(),init)
        -- end
        -- print( 'Timer timed out at '..time..' seconds!')
    -- end
    
    -- local ex = function()
        -- co=coroutine.create(timer)
        -- coroutine.resume(co,5) -- timer starts here!
        -- while coroutine.status(co)~="dead" do
            -- print("time passed",select(2,coroutine.resume(co)))
            -- print('',coroutine.status(co))
            -- socket.sleep(1)
        -- end
    -- end
    
    -- c2 = coroutine.create(ex)
    -- coroutine.resume(c2,1)
-- end
-- abc()
-- print(22222)


-- return namespace

return _JS
