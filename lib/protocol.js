/**
 * Функции разбора и формирования данных
 */
const util = require("util");


// exports.readValue = readValue;
exports.getPolls = getPolls;
exports.getPollArray = getPollArray;
exports.getDataFromResponse = getDataFromResponse;
exports.transformStoH = transformStoH;

function getDataFromResponse(buf, ref) {
  if (!ref || !util.isArray(ref)) return;
  return ref.map(item => ({ id: item.id, value: readValue(buf, item) }));
}

function getPolls(aconfig, params) {
  if (!aconfig || !util.isArray(aconfig)) return [];
  let result = [];
  let maxReadLen = params.maxreadlen || 240;

  aconfig.sort(byorder("unitid,desc,fcr,address"));

  // Выбираем переменные, которые можно читать группами, и формируем команды опроса
  const config = aconfig.filter(item => item.gr);
  let i = 0;
  let current;
  let length;

  while (i < config.length) {
    let item = config[i];
    if (
      !current ||
      isDiffBlock(item) ||
      getLengthAfterAdd(item) > maxReadLen
    ) {
      if (current && length) result.push(Object.assign({ length }, current));
      length = 0;
      current = {
        unitid: item.unitid,
        desc: item.desc,
        address: item.address,
        ref: []
      };
    }

    length = getLengthAfterAdd(item);
    let refobj = {
      id: item.id,
      vartype: item.vartype,
      widx: item.address - current.address
    };

    if (item.usek) {
      refobj.usek = item.usek;
      refobj.ks0 = Number(item.ks0) || 0;
      refobj.ks = Number(item.ks) || 0;
      refobj.kh0 = Number(item.kh0) || 0;
      refobj.kh = Number(item.kh) || 0;

      if (refobj.ks <= refobj.ks0) refobj.ks = refobj.ks0 + 1;
      if (refobj.kh <= refobj.kh0) refobj.kh = refobj.kh0 + 1;
    }
    current.ref.push(refobj);

    i++;
  }
  if (current && length) result.push(Object.assign({ length }, current));

  // Результат д б такой:
  /*
    return [
        {unitid:1, desc:'AI', address: 4000, length:4, fcr:"4", ref:
             [{id:'ch1', widx:0, vartype:'int16'},
              {id:'ch2', widx:1, vartype:'int16'}]
        }    
    ];
    */

  // Добавить негрупповое чтение

  console.log("polls=" + util.inspect(result));
  return result;

  function isDiffBlock(citem) {
    return citem.unitid != current.unitid || citem.desc != current.desc || citem.fcr != current.fcr;
  }

  function getLengthAfterAdd(citem) {
    return citem.address - current.address + getVarLen(citem.vartype);
  }
}

function getPollArray(polls) {
  //  Пока просто заполяем индексы всех записей
  // Нужно будет отсекать с низким приоритетом позднее
  return polls.map((item, index) => index);
}

function readValue(buffer, item) {
  let buf;
  let i1;
  let i2;
  let offset = item.widx;
  let vartype = item.vartype;
  let result;

  switch (vartype) {
    case "bool":
      // return buffer[offset] ? 1 : 0;
      return buffer[offset];
     
    case "byte":
      result = buffer.readUInt8(offset * 2 + 1);
      break;
    case "uint8":
      result = buffer.readUInt8(offset * 2);
      break;
    case "uint16be":
      result = buffer.readUInt16BE(offset * 2);
      break;
    case "uint16le":
      result = buffer.readUInt16LE(offset * 2);
      break;
    case "int16be":
      result = buffer.readInt16BE(offset * 2);
      break;
    case "int16le":
      result = buffer.readInt16LE(offset * 2);
      break;
    case "uint32be":
      result = buffer.readUInt32BE(offset * 2);
      break;
    case "uint32le":
      result = buffer.readUInt32LE(offset * 2);
      break;

    case "uint32sw":
      buf = new Buffer(4);
      buf[0] = buffer[offset * 2 + 2];
      buf[1] = buffer[offset * 2 + 3];
      buf[2] = buffer[offset * 2 + 0];
      buf[3] = buffer[offset * 2 + 1];
      result = buf.readUInt32BE(0);
      break;
    case "uint32sb":
      buf = new Buffer(4);
      buf[0] = buffer[offset * 2 + 1];
      buf[1] = buffer[offset * 2 + 0];
      buf[2] = buffer[offset * 2 + 3];
      buf[3] = buffer[offset * 2 + 2];
      result = buf.readUInt32BE(0);
      break;
    case "int32be":
      result = buffer.readInt32BE(offset * 2);
      break;
    case "int32le":
      result = buffer.readInt32LE(offset * 2);
      break;
    case "int32sw":
      buf = new Buffer(4);
      buf[0] = buffer[offset * 2 + 2];
      buf[1] = buffer[offset * 2 + 3];
      buf[2] = buffer[offset * 2 + 0];
      buf[3] = buffer[offset * 2 + 1];
      result = buf.readInt32BE(0);
      break;
    case "int32sb":
      buf = new Buffer(4);
      buf[0] = buffer[offset * 2 + 1];
      buf[1] = buffer[offset * 2 + 0];
      buf[2] = buffer[offset * 2 + 3];
      buf[3] = buffer[offset * 2 + 2];
      result = buf.readInt32BE(0);
      break;
    case "uint64be":
      result =
        buffer.readUInt32BE(offset * 2) * 0x100000000 +
        buffer.readUInt32BE(offset * 2 + 4);
      break;
    case "uint64le":
      result =
        buffer.readUInt32LE(offset * 2) +
        buffer.readUInt32LE(offset * 2 + 4) * 0x100000000;
      break;
    case "int64be":
      i1 = buffer.readInt32BE(offset * 2);
      i2 = buffer.readUInt32BE(offset * 2 + 4);
      // <<32 does not work
      result = i1 >= 0 ? i1 * 0x100000000 + i2 : i1 * 0x100000000 - i2;
      break;
    case "int64le":
      i2 = buffer.readUInt32LE(offset * 2);
      i1 = buffer.readInt32LE(offset * 2 + 4);
      result = i1 >= 0 ? i1 * 0x100000000 + i2 : i1 * 0x100000000 - i2;
      break;

    case "floatbe":
      result = buffer.readFloatBE(offset * 2);
      break;
    case "floatle":
      result = buffer.readFloatLE(offset * 2);
      break;
    case "floatsw":
      buf = new Buffer(4);
      buf[0] = buffer[offset * 2 + 2];
      buf[1] = buffer[offset * 2 + 3];
      buf[2] = buffer[offset * 2 + 0];
      buf[3] = buffer[offset * 2 + 1];
      result = buf.readFloatBE(0);
      break;
    case "floatsb":
      buf = new Buffer(4);
      buf[0] = buffer[offset * 2 + 1];
      buf[1] = buffer[offset * 2 + 0];
      buf[2] = buffer[offset * 2 + 3];
      buf[3] = buffer[offset * 2 + 2];
      result = buf.readFloatBE(0);
      break;
    case "doublebe":
      result = buffer.readDoubleBE(offset * 2);
      break;
    case "doublele":
      result = buffer.readDoubleLE(offset * 2);
      break;
    default:
      console.log("Invalid type: " + vartype);
      return 0;
  }

  return (item.usek) ? transformHtoS(result, item): result;
}

// Возвращает кол-во СЛОВ (word) или бит по типу переменной
function getVarLen(vartype) {
  switch (vartype) {
    case "bool":
    case "byte":
    case "uint8":
    case "uint16be":
    case "uint16le":
    case "int16be":
    case "int16le":
      return 1;

    case "uint32be":
    case "uint32le":
    case "uint32sw":
    case "uint32sb":
    case "int32be":
    case "int32le":
    case "int32sw":
    case "int32sb":
    case "floatbe":
    case "floatle":
    case "floatsw":
    case "floatsb":
      return 2;

    case "doublebe":
    case "doublele":
      return 4;
    default:
      console.log("Invalid type: " + vartype);
      return 0;
  }
}

/** Функция сортировки используется в качестве вызываемой функции для сортировки массива ОБЪЕКТОВ
 *   arr.sort(byorder('place,room','D')
 *    @param {String}  ordernames - имена полей для сортировки через запятую
 *    @param {*}   direction: D-descending
 *
 * Возвращает функцию сравнения
 **/
function byorder(ordernames, direction, parsingInt) {
  var arrForSort = [];
  var dirflag = direction == "D" ? -1 : 1; // ascending = 1, descending = -1;

  if (ordernames && typeof ordernames == "string")
    arrForSort = ordernames.split(",");

  return function(o, p) {
    if (typeof o != "object" || typeof p != "object") return 0;
    if (arrForSort.length == 0) return 0;

    for (var i = 0; i < arrForSort.length; i++) {
      let a;
      let b;
      let name = arrForSort[i];

      a = o[name];
      b = p[name];
      if (a != b) {
        if (parsingInt) {
          let astr = String(a);
          let bstr = String(b);
          if (!isNaN(parseInt(astr, 10)) && !isNaN(parseInt(bstr, 10))) {
            return parseInt(astr, 10) < parseInt(bstr, 10)
              ? -1 * dirflag
              : 1 * dirflag;
          }
        }

        // сравним как числа
        if (!isNaN(Number(a)) && !isNaN(Number(b))) {
          return Number(a) < Number(b) ? -1 * dirflag : 1 * dirflag;
        }

        // одинаковый тип, не числа
        if (typeof a === typeof b) {
          return a < b ? -1 * dirflag : 1 * dirflag;
        }

        return typeof a < typeof b ? -1 * dirflag : 1 * dirflag;
      }
    }
    return 0;
  };
}

// При записи
function transformStoH(value, {ks0, ks, kh0, kh }) {
    ks0 = Number(ks0) || 0;
    kh0 = Number(kh0) || 0;
    ks = ks != ks0 ? Number(ks) : ks0 + 1;
    kh = Number(kh);
    console.log('TRANSFORM WRITE: '+value+' ks0='+ks0+' ks='+ks+' kh0='+kh0+' kh='+kh )
    return kh != kh0
      ? Math.round((value - ks0) * (kh - kh0) / (ks - ks0)) + kh0
      : kh;
  }

  // При чтении - коэф-ты уже обработаны
  function transformHtoS(value, {ks0, ks, kh0, kh }) {
    // return value;
    console.log('TRANSFORM '+value+' ks0='+ks0+' ks='+ks+' kh0='+kh0+' kh='+kh )

    let result = Math.round((value - kh0) * (ks - ks0) / (kh - kh0)) + ks0;
    console.log('TRANSFORM RESULT='+result);
    return result;
  }