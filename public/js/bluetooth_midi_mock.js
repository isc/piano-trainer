const mockBluetooth = {
  requestDevice: async (opts) => {
    function FakeCharacteristic() {
      this._listeners = {}
      this._mockMidiEvents = []
    }

    FakeCharacteristic.prototype.startNotifications = function () {
      return Promise.resolve(this)
    }

    FakeCharacteristic.prototype.addEventListener = function (event, cb) {
      this._listeners[event] = cb

      if (event === 'characteristicvaluechanged') {
        // Listen for custom events to trigger MIDI data
        window.addEventListener('mock-midi-input', (e) => {
          const dataArray = e.detail.data
          const uint8Array = new Uint8Array(dataArray)
          const value = new DataView(uint8Array.buffer)
          cb({ target: { value } })
        })
      }
    }

    function FakeService() {}
    FakeService.prototype.getCharacteristic = function (uuid) {
      return Promise.resolve(new FakeCharacteristic())
    }

    function FakeServer() {}
    FakeServer.prototype.getPrimaryService = function (uuid) {
      return Promise.resolve(new FakeService())
    }

    function FakeDevice(name) {
      this.name = name
      this.gatt = {
        connect: () => Promise.resolve(new FakeServer()),
      }
      this.addEventListener = function () {}
    }

    return new FakeDevice('Mock MIDI Keyboard')
  },
}

export default mockBluetooth
