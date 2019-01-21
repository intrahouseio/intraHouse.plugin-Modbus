/**
 * Функции разбора и формирования данных
 */
const util = require("util");

const MAX_READ_LEN = 100;

exports.readValue = readValue;
exports.getPolls = getPolls;
exports.getPollArray = getPollArray;
exports.getDataFromResponse = getDataFromResponse;

function getDataFromResponse(buf, ref) {
  if (!ref || !util.isArray(ref)) return;
  return ref.map(item => {
    return { id: item.id, value: readValue(buf, item.widx, item.vartype) };
  });
}

function getPolls(config) {
  if (!config || !util.isArray(config)) return [];
  let result = [];

  // сортируем по unitid, desc, address

  config.sort(byorder("unitid,desc,address"));
  let i = 0;
  let current;
  let length;

  while (i < config.length) {
    let item = config[i];
    if (
      !current ||
      isDiffBlock(item) ||
      getLengthAfterAdd(item) > MAX_READ_LEN
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
    current.ref.push({
      id: item.id,
      vartype: item.vartype,
      widx: item.address - current.address
    });
    i++;
  }
  if (current && length) result.push(Object.assign({ length }, current));

  // Результат д б такой:
  /*
    return [
        {unitid:1, desc:'AI', address: 4000, length:4,  ref:
             [{id:'ch1', widx:0, vartype:'int16'},
              {id:'ch2', widx:1, vartype:'int16'}]
        }    
    ];
    */
  console.log("polls=" + util.inspect(result));
  return result;

  function isDiffBlock(citem) {
    return citem.unitid != current.unitid || citem.desc != current.desc;
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

function readValue(buffer, offset, vartype) {
  var buf;

  switch (vartype) {
    case "bool":
    return buffer[offset] ? 1 : 0;

    case "byte":
      return buffer.readUInt8(offset * 2 + 1);

    case "uint8":
      return buffer.readUInt8(offset * 2);

    case "uint16be":
      return buffer.readUInt16BE(offset * 2);

    case "uint16le":
      return buffer.readUInt16LE(offset * 2);
    case "int16be":
      return buffer.readInt16BE(offset * 2);
    case "int16le":
      return buffer.readInt16LE(offset * 2);
    case "uint32be":
      return buffer.readUInt32BE(offset * 2);
    case "uint32le":
      return buffer.readUInt32LE(offset * 2);

    case "uint32sw":
      buf = new Buffer(4);
      buf[0] = buffer[offset * 2 + 2];
      buf[1] = buffer[offset * 2 + 3];
      buf[2] = buffer[offset * 2 + 0];
      buf[3] = buffer[offset * 2 + 1];
      return buf.readUInt32BE(0);

    case "uint32sb":
      buf = new Buffer(4);
      buf[0] = buffer[offset * 2 + 1];
      buf[1] = buffer[offset * 2 + 0];
      buf[2] = buffer[offset * 2 + 3];
      buf[3] = buffer[offset * 2 + 2];
      return buf.readUInt32BE(0);

    case "int32be":
      return buffer.readInt32BE(offset * 2);
    case "int32le":
      return buffer.readInt32LE(offset * 2);
    case "int32sw":
      buf = new Buffer(4);
      buf[0] = buffer[offset * 2 + 2];
      buf[1] = buffer[offset * 2 + 3];
      buf[2] = buffer[offset * 2 + 0];
      buf[3] = buffer[offset * 2 + 1];
      return buf.readInt32BE(0);
    case "int32sb":
      buf = new Buffer(4);
      buf[0] = buffer[offset * 2 + 1];
      buf[1] = buffer[offset * 2 + 0];
      buf[2] = buffer[offset * 2 + 3];
      buf[3] = buffer[offset * 2 + 2];
      return buf.readInt32BE(0);
    case "uint64be":
      return (
        buffer.readUInt32BE(offset * 2) * 0x100000000 +
        buffer.readUInt32BE(offset * 2 + 4)
      );
    case "uint64le":
      return (
        buffer.readUInt32LE(offset * 2) +
        buffer.readUInt32LE(offset * 2 + 4) * 0x100000000
      );
    case "int64be":
      i1 = buffer.readInt32BE(offset * 2);
      i2 = buffer.readUInt32BE(offset * 2 + 4);
      if (i1 >= 0) {
        return i1 * 0x100000000 + i2; // <<32 does not work
      } else {
        return i1 * 0x100000000 - i2; // I have no solution for that !
      }
      break;
    case "int64le":
      i2 = buffer.readUInt32LE(offset * 2);
      i1 = buffer.readInt32LE(offset * 2 + 4);
      if (i1 >= 0) {
        return i1 * 0x100000000 + i2; // <<32 does not work
      } else {
        return i1 * 0x100000000 - i2; // I have no solution for that !
      }
      break;
    case "floatbe":
      return buffer.readFloatBE(offset * 2);
    case "floatle":
      return buffer.readFloatLE(offset * 2);
    case "floatsw":
      buf = new Buffer(4);
      buf[0] = buffer[offset * 2 + 2];
      buf[1] = buffer[offset * 2 + 3];
      buf[2] = buffer[offset * 2 + 0];
      buf[3] = buffer[offset * 2 + 1];
      return buf.readFloatBE(0);
    case "floatsb":
      buf = new Buffer(4);
      buf[0] = buffer[offset * 2 + 1];
      buf[1] = buffer[offset * 2 + 0];
      buf[2] = buffer[offset * 2 + 3];
      buf[3] = buffer[offset * 2 + 2];
      return buf.readFloatBE(0);
    case "doublebe":
      return buffer.readDoubleBE(offset * 2);
    case "doublele":
      return buffer.readDoubleLE(offset * 2);
    default:
      console.log("Invalid type: " + vartype);
      return 0;
  }
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
