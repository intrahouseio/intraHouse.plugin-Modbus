/** 
* @name Чтение и запись регистров modbus 
* @desc  
* @version 4  
*/

/*
  Для чтения и записи используется массив data, содержащий одну или несколько структур:
  Для чтения:
  {
    unitid: 1,            // UnitID устройства
    fcr: 3,               // код функции
    address: 16386,       // адрес для чтения
    length: 2,            // количество слов
    offset: 0,            // смещение
    vartype: 'uint32sw'   // тип переменной
  }
  Для записи:
  {
    unitid: 1,            // UnitID устройства
    address: 16386,       // адрес для чтения
    length: 2,            // количество слов
    offset: 0,            // смещение
    vartype: 'uint32sw',  // тип переменной
    value: 5              // записываемое значение
  }
*/


script({
  read(plugin, data, callback) {
    this.pluginCommand({
      unit: plugin,
      command: 'read',
      data: data
    }, callback);
  },

  write(plugin, data, callback) {
    this.pluginCommand({
      unit: plugin,
      command: 'write',
      data: data
    }, callback);
  },

  terminate() {
    this.exit();
  },

  getReadResult(arg) {
    this.log(JSON.stringify(arg, null, 4));
  },

  start(arg) {
    this.addTimer('T1');
    this.startTimer('T1', 5, 'terminate');
    this.read('modbus1',
      [
        {
          unitid: 1,
          fcr: 3,
          address: 16386,
          length: 2,
          offset: 0,
          vartype: 'uint32sw',
        },
        {
          unitid: 1,
          fcr: 3,
          address: 16388,
          length: 2,
          offset: 0,
          vartype: 'uint32sw',
        },
        {
          unitid: 1,
          fcr: 3,
          address: 16390,
          length: 2,
          offset: 0,
          vartype: 'uint32sw',
        },
        {
          unitid: 1,
          fcr: 3,
          address: 16392,
          length: 1,
          offset: 0,
          vartype: 'int16be',
        }
      ],
      'getReadResult'
    );

    this.write('modbus1',
      [
        {
          unitid: 1,
          address: 16392,
          length: 1,
          offset: 0,
          vartype: 'int16be',
          value: 5
        }
      ]
    );
  }
});