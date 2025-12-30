const mockBluetooth = {
  requestDevice: async (_opts) => {
    function FakeCharacteristic() {
      this._listeners = {}
      this._windowListener = null
    }

    FakeCharacteristic.prototype.startNotifications = function () {
      return Promise.resolve(this)
    }

    FakeCharacteristic.prototype.addEventListener = function (event, cb) {
      // Support multiple listeners per event type
      if (!this._listeners[event]) {
        this._listeners[event] = []
      }
      this._listeners[event].push(cb)

      if (event === 'characteristicvaluechanged' && !this._windowListener) {
        // Store the listener reference to prevent memory leaks
        this._windowListener = (e) => {
          const dataArray = e.detail.data
          const uint8Array = new Uint8Array(dataArray)
          const value = new DataView(uint8Array.buffer)
          // Call all registered listeners
          this._listeners[event].forEach((listener) => {
            listener({ target: { value } })
          })
        }
        window.addEventListener('mock-midi-input', this._windowListener)
      }
    }

    function FakeService() {}
    FakeService.prototype.getCharacteristic = function (_uuid) {
      return Promise.resolve(new FakeCharacteristic())
    }

    function FakeServer() {}
    FakeServer.prototype.getPrimaryService = function (_uuid) {
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
