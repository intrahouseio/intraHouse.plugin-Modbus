
## intraHouse.plugin-Modbus

Используется библиотека modbus-serial: https://github.com/yaacov/node-modbus-serial

Реализованы клиенты:

**Client TCP**

* Modbus TCP: 
  Пакеты должны иметь MBAP Header - Modbus Application Header 

* Modbus RTU over TCP: 
  Исп, если пакеты RTU передаются в TCP сокет без преобразования.

* Modbus RTU=>TCP (буферизация): 
  Исп. при наличии шлюза, преобразующего пакеты RTU в TCP, но вариант 1 не работает (Serial устройства медленные)

**Client RTU**

* Modbus RTU: Over serial line.
