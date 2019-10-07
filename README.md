
## intraHouse.plugin-Modbus

Используется библиотека modbus-serial: https://github.com/yaacov/node-modbus-serial

На данный момент реализовано:

**Modbus TCP** - стандартный протокол.

Реализация RTU через TCP. Здесь возможно два варианта:

1. **Modbus RTU over TCP** - пакеты RTU передаются в TCP сокет без преобразования.
   
2. **Modbus RTU=>TCP (буферизация)** - пакеты RTU преобразуются шлюзом в Modbus TCP: убирается SlaveId и CRC, добавляется MBAP Header - Modbus Application Header. 

Таким образом, если шлюз преобразовывает пакеты, то можно использовать **Modbus TCP**. 
Вариант  **Modbus RTU=>TCP (буферизация)** используется, если Serial устройства медленные, при этом используется MBAP 

