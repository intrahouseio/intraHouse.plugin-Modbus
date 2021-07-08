/**
 * Функции разбора и формирования данных
 */
const util = require('util');

exports.parseBufferRead = parseBufferRead;
exports.parseBufferWrite = parseBufferWrite;
exports.readValue = readValue;
exports.writeValue = writeValue;
exports.getPolls = getPolls;
exports.getPollArray = getPollArray;
exports.getDataFromResponse = getDataFromResponse;
exports.transformStoH = transformStoH;
exports.transformHtoS = transformHtoS;

function getDataFromResponse(buf, ref) {
  if (!ref || !util.isArray(ref)) {
    return;
  }

  return ref.map(item => ({ id: item.id, value: readValue(buf, item) }));
}

function getPolls(channels, params) {
  if (!channels || !util.isArray(channels)) {
    return [];
  }

  let result = [];
  let maxReadLen = params.maxreadlen || 240;

  channels.sort(byorder('unitid,fcr,address'));

  // Выбираем переменные, которые можно читать группами, и формируем команды опроса
  const config = channels.filter(item => item.gr);
  let i = 0;
  let current;
  let length;

  while (i < config.length) {
    let item = config[i];
    if (!current || isDiffBlock(item) || getLengthAfterAdd(item) > maxReadLen) {
      // Записать предыдущий элемент
      if (current && length) {
        result.push(Object.assign({ length }, current));
      }

      length = 0;
      current = {
        unitid: item.unitid,
        desc: item.desc,
        fcr: item.fcr,
        address: item.address,
        ref: []
      };
    }

    length = getLengthAfterAdd(item);

    let refobj = getRefobj(item);
    refobj.widx = item.address - current.address;
    current.ref.push(refobj);

    i++;
  }

  if (current && length) {
    result.push(Object.assign({ length }, current));
  }

  // Результат д б такой:
  /*
    return [
        {unitid:1, desc:'AI', address: 4000, length:4, fcr:'4', ref:
             [{id:'ch1', widx:0, vartype:'int16'},
              {id:'ch2', widx:1, vartype:'int16'}]
        }    
    ];
    */

  // Добавить негрупповое чтение
  channels
    .filter(item => !item.gr && item.r)
    .forEach(item => {
      if (!item.vartype) {
        console.log('NO VARTYPE: ' + util.inspect(item));
      } else {
        result.push({
          length: getVarLen(item.vartype),
          unitid: item.unitid,
          desc: item.desc,
          fcr: item.fcr,
          address: item.address,
          ref: [getRefobj(item)]
        });
      }
    });

  return result;

  function isDiffBlock(citem) {
    return citem.unitid != current.unitid || citem.fcr != current.fcr;
  }

  function getLengthAfterAdd(citem) {
    return citem.address - current.address + getVarLen(citem.vartype);
  }
}

function getRefobj(item) {
  let refobj = {
    id: item.id,
    vartype: item.vartype,
    widx: 0
  };

  if (item.bit) {
    refobj.bit = item.bit;
    refobj.offset = item.offset;
  }

  if (item.usek) {
    refobj.usek = item.usek;
    refobj.ks0 = parseInt(item.ks0) || 0;
    refobj.ks = parseInt(item.ks) || 0;
    refobj.kh0 = parseInt(item.kh0) || 0;
    refobj.kh = parseInt(item.kh) || 0;

    if (refobj.ks <= refobj.ks0) {
      refobj.ks = refobj.ks0 + 1;
    }

    if (refobj.kh <= refobj.kh0) {
      refobj.kh = refobj.kh0 + 1;
    }
  }
  return refobj;
}

function getPollArray(polls) {
  // Пока просто заполяем индексы всех записей
  // Нужно будет отсекать с низким приоритетом позднее
  return polls.map((item, index) => index);
}

function parseBufferRead(buffer, item) {
  let buf;
  let i1;
  let i2;
  let offset = item.widx;
  let vartype = item.vartype;

  switch (vartype) {
    case 'bool':
      return getBitValue(buffer, offset);
    case 'uint8be':
      return buffer.readUInt8(offset * 2 + 1);
    case 'uint8le':
      return buffer.readUInt8(offset * 2);
    case 'int8be':
      return buffer.readInt8(offset * 2 + 1);
    case 'int8le':
      return buffer.readInt8(offset * 2);
    case 'uint16be':
      return buffer.readUInt16BE(offset * 2);
    case 'uint16le':
      return buffer.readUInt16LE(offset * 2);
    case 'int16be':
      return buffer.readInt16BE(offset * 2);
    case 'int16le':
      return buffer.readInt16LE(offset * 2);
    case 'uint32be':
      return buffer.readUInt32BE(offset * 2);
    case 'uint32le':
      return buffer.readUInt32LE(offset * 2);
    case 'uint32sw':
      // buf = new Buffer(4);
      buf = Buffer.alloc(4);
      buf[0] = buffer[offset * 2 + 2];
      buf[1] = buffer[offset * 2 + 3];
      buf[2] = buffer[offset * 2 + 0];
      buf[3] = buffer[offset * 2 + 1];
      return buf.readUInt32BE(0);
    case 'uint32sb':
      buf = Buffer.alloc(4);
      buf[0] = buffer[offset * 2 + 1];
      buf[1] = buffer[offset * 2 + 0];
      buf[2] = buffer[offset * 2 + 3];
      buf[3] = buffer[offset * 2 + 2];
      return buf.readUInt32BE(0);
    case 'int32be':
      return buffer.readInt32BE(offset * 2);
    case 'int32le':
      return buffer.readInt32LE(offset * 2);
    case 'int32sw':
      buf = Buffer.alloc(4);
      buf[0] = buffer[offset * 2 + 2];
      buf[1] = buffer[offset * 2 + 3];
      buf[2] = buffer[offset * 2 + 0];
      buf[3] = buffer[offset * 2 + 1];
      return buf.readInt32BE(0);
    case 'int32sb':
      buf = Buffer.alloc(4);
      buf[0] = buffer[offset * 2 + 1];
      buf[1] = buffer[offset * 2 + 0];
      buf[2] = buffer[offset * 2 + 3];
      buf[3] = buffer[offset * 2 + 2];
      return buf.readInt32BE(0);
    case 'uint64be':
      return buffer.readUInt32BE(offset * 2) * 0x100000000 + buffer.readUInt32BE(offset * 2 + 4);
    case 'uint64le':
      return buffer.readUInt32LE(offset * 2) + buffer.readUInt32LE(offset * 2 + 4) * 0x100000000;
    case 'int64be':
      i1 = buffer.readInt32BE(offset * 2);
      i2 = buffer.readUInt32BE(offset * 2 + 4);

      if (i1 >= 0) {
        return i1 * 0x100000000 + i2; // <<32 does not work
      }
      return i1 * 0x100000000 - i2; // I have no solution for that !

    case 'int64le':
      i2 = buffer.readUInt32LE(offset * 2);
      i1 = buffer.readInt32LE(offset * 2 + 4);

      if (i1 >= 0) {
        return i1 * 0x100000000 + i2; // <<32 does not work
      }
      return i1 * 0x100000000 - i2; // I have no solution for that !

    case 'floatbe':
      return buffer.readFloatBE(offset * 2);
    case 'floatle':
      return buffer.readFloatLE(offset * 2);
    case 'floatsw':
      buf = Buffer.alloc(4);
      buf[0] = buffer[offset * 2 + 2];
      buf[1] = buffer[offset * 2 + 3];
      buf[2] = buffer[offset * 2 + 0];
      buf[3] = buffer[offset * 2 + 1];
      return buf.readFloatBE(0);
    case 'floatsb':
      buf = Buffer.alloc(4);
      buf[0] = buffer[offset * 2 + 1];
      buf[1] = buffer[offset * 2 + 0];
      buf[2] = buffer[offset * 2 + 3];
      buf[3] = buffer[offset * 2 + 2];
      return buf.readFloatBE(0);
    case 'doublebe':
      return buffer.readDoubleBE(offset * 2);
    case 'doublele':
      return buffer.readDoubleLE(offset * 2);
    default:
      throw new Error(`Invalid type: ${vartype}`);
  }
}

function readValue(buffer, item) {
  let result = parseBufferRead(buffer, item);

  return processOneValue(result, item);
  // return item.usek ? transformHtoS(result, item) : result;
}

function processOneValue(result, item) {
  if (item.usek) return transformHtoS(result, item);
  if (item.bit) return extractBit(result, item.offset);
  return result;
}

function extractBit(val, offset) {
  return val & (1 << offset) ? 1 : 0;
}

function parseBufferWrite(value, item) {
  let a0;
  let a1;
  let a2;
  let buffer;
  let vartype = item.vartype;

  switch (vartype) {
    case 'uint8be':
      buffer = Buffer.alloc(2);
      buffer[0] = 0;
      buffer.writeUInt8(value & 0xff, 1);
      break;
    case 'uint8le':
      buffer = Buffer.alloc(2);
      buffer[1] = 0;
      buffer.writeUInt8(value & 0xff, 0);
      break;
    case 'int8be':
      buffer = Buffer.alloc(2);
      buffer[0] = 0;
      buffer.writeInt8(value & 0xff, 1);
      break;
    case 'int8le':
      buffer = Buffer.alloc(2);
      buffer[1] = 0;
      buffer.writeInt8(value & 0xff, 0);
      break;
    case 'uint16be':
      buffer = Buffer.alloc(2);
      if (value > 65565) {
        console.log('TOO BIG NUMBER! '+value);
      }
      buffer.writeUInt16BE(value, 0);
      break;
    case 'uint16le':
      buffer = Buffer.alloc(2);
      buffer.writeUInt16LE(value, 0);
      break;
    case 'int16be':
      // buffer = new Buffer(2);
      buffer = Buffer.alloc(2);
      buffer.writeInt16BE(value, 0);
      break;
    case 'int16le':
      buffer = Buffer.alloc(2);
      buffer.writeInt16LE(value, 0);
      break;
    case 'uint32be':
      buffer = Buffer.alloc(4);
      buffer.writeUInt32BE(value, 0);
      break;
    case 'uint32le':
      buffer = Buffer.alloc(4);
      buffer.writeUInt32LE(value, 0);
      break;
    case 'uint32sw':
      buffer = Buffer.alloc(4);
      buffer.writeUInt32BE(value, 0);
      a0 = buffer[0];
      a1 = buffer[1];
      buffer[0] = buffer[2];
      buffer[1] = buffer[3];
      buffer[2] = a0;
      buffer[3] = a1;
      break;
    case 'uint32sb':
      buffer = Buffer.alloc(4);
      buffer.writeUInt32BE(value, 0);
      a0 = buffer[0];
      a2 = buffer[2];
      buffer[0] = buffer[1];
      buffer[2] = buffer[3];
      buffer[1] = a0;
      buffer[3] = a2;
      break;
    case 'int32be':
      buffer = Buffer.alloc(4);
      buffer.writeInt32BE(value, 0);
      break;
    case 'int32le':
      buffer = Buffer.alloc(4);
      buffer.writeInt32LE(value, 0);
      break;
    case 'int32sw':
      buffer = Buffer.alloc(4);
      buffer.writeInt32BE(value, 0);
      a0 = buffer[0];
      a1 = buffer[1];
      buffer[0] = buffer[2];
      buffer[1] = buffer[3];
      buffer[2] = a0;
      buffer[3] = a1;
      break;
    case 'int32sb':
      buffer = Buffer.alloc(4);
      buffer.writeInt32BE(value, 0);
      a0 = buffer[0];
      a2 = buffer[2];
      buffer[0] = buffer[1];
      buffer[2] = buffer[3];
      buffer[1] = a0;
      buffer[3] = a2;
      break;
    case 'uint64be':
      buffer = Buffer.alloc(8);
      buffer.writeUInt32BE(value >> 32, 0);
      buffer.writeUInt32BE(value & 0xffffffff, 4);
      break;
    case 'uint64le':
      buffer = Buffer.alloc(8);
      buffer.writeUInt32LE(value & 0xffffffff, 0);
      buffer.writeUInt32LE(value >> 32, 4);
      break;
    case 'int64be':
      buffer = Buffer.alloc(8);
      buffer.writeInt32BE(value >> 32, 0);
      buffer.writeUInt32BE(value & 0xffffffff, 4);
      break;
    case 'int64le':
      buffer = Buffer.alloc(8);
      buffer.writeUInt32LE(value & 0xffffffff, 0);
      buffer.writeInt32LE(value >> 32, 4);
      break;
    case 'floatbe':
      buffer = Buffer.alloc(4);
      buffer.writeFloatBE(value, 0);
      break;
    case 'floatle':
      buffer = Buffer.alloc(4);
      buffer.writeFloatLE(value, 0);
      break;
    case 'floatsw':
      buffer = Buffer.alloc(4);
      buffer.writeFloatBE(value, 0);
      a0 = buffer[0];
      a1 = buffer[1];
      buffer[0] = buffer[2];
      buffer[1] = buffer[3];
      buffer[2] = a0;
      buffer[3] = a1;
      break;
    case 'floatsb':
      buffer = Buffer.alloc(4);
      buffer.writeFloatBE(value, 0);
      a0 = buffer[0];
      a2 = buffer[2];
      buffer[0] = buffer[1];
      buffer[2] = buffer[3];
      buffer[1] = a0;
      buffer[3] = a2;
      break;
    case 'doublebe':
      buffer = Buffer.alloc(8);
      buffer.writeDoubleBE(value, 0);
      break;
    case 'doublele':
      buffer = Buffer.alloc(8);
      buffer.writeDoubleLE(value, 0);
      break;
    default:
      console.log(`Invalid type: ${vartype}  THROW`);
      throw new Error(`Invalid type: ${vartype}`);
  }
  return buffer;
}

function writeValue(buffer, item) {
  let val = item.usek ? transformStoH(buffer, item) : buffer;
  console.log('tools.writeValue val = '+util.inspect(val))
  return parseBufferWrite(val, item);
}

function getBitValue(buffer, offset) {
  // Приходит упакованное побайтно
  let i = Math.floor(offset / 8);
  let j = offset % 8;

  return buffer[i] & (1 << j) ? 1 : 0;
}

// Возвращает кол-во СЛОВ (word) или бит по типу переменной
function getVarLen(vartype) {
  switch (vartype) {
    case 'bool':
    case 'uint8be':
    case 'uint8le':
    case 'int8be':
    case 'int8le':
    case 'uint16be':
    case 'uint16le':
    case 'int16be':
    case 'int16le':
      return 1;

    case 'uint32be':
    case 'uint32le':
    case 'uint32sw':
    case 'uint32sb':
    case 'int32be':
    case 'int32le':
    case 'int32sw':
    case 'int32sb':
    case 'floatbe':
    case 'floatle':
    case 'floatsw':
    case 'floatsb':
      return 2;

    case 'int64be':
    case 'int64le':
    case 'uint64be':
    case 'uint64le':
    case 'doublebe':
    case 'doublele':
      return 4;
    default:
      throw new Error(`Invalid type: ${vartype}`);
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
  var dirflag = direction == 'D' ? -1 : 1; // ascending = 1, descending = -1;

  if (ordernames && typeof ordernames == 'string') {
    arrForSort = ordernames.split(',');
  }

  return function(o, p) {
    if (typeof o !== 'object' || typeof p !== 'object' || arrForSort.length === 0) {
      return 0;
    }

    for (let i = 0; i < arrForSort.length; i++) {
      let a;
      let b;
      let name = arrForSort[i];

      a = o[name];
      b = p[name];

      if (a !== b) {
        if (parsingInt) {
          let astr = String(a);
          let bstr = String(b);

          if (!isNaN(parseInt(astr, 10)) && !isNaN(parseInt(bstr, 10))) {
            return parseInt(astr, 10) < parseInt(bstr, 10) ? -1 * dirflag : 1 * dirflag;
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
function transformStoH(value, { ks0, ks, kh0, kh }) {
  value = parseInt(value);
  ks0 = parseInt(ks0) || 0;
  kh0 = parseInt(kh0) || 0;
  ks = ks != ks0 ? parseInt(ks) : ks0 + 1;
  kh = parseInt(kh);
  return kh != kh0 ? Math.round(((value - ks0) * (kh - kh0)) / (ks - ks0)) + kh0 : kh;
}

// При чтении - коэф-ты уже обработаны
function transformHtoS(value, { ks0, ks, kh0, kh }) {
  let result = Math.round(((value - kh0) * (ks - ks0)) / (kh - kh0)) + ks0;

  return result;
}
