// The worker has its own scope and no direct access to functions/objects of the global scope.
// We import the generated JS file to make `wasm_bindgen` available which we need to initialize
// our WASM code.
importScripts('./pkg/map_drawer.js')

var offscreenCanvas = null
var drawingContext = null
var lastActiveShape = 'init'

console.log('Initializing worker')

// In the worker, we have a different struct that we want to use as in `index.js`.
const { MapDrawerInterface } = wasm_bindgen

async function init_wasm_in_worker() {
  // Load the wasm file by awaiting the Promise returned by `wasm_bindgen`.
  await wasm_bindgen('./pkg/map_drawer_bg.wasm')

  const mapDrawer = MapDrawerInterface.new()

  // Load SVG content in worker
  const svg_content = await fetch('./office.svg').then((resp) => resp.text())
  mapDrawer.parse_svg(svg_content)

  // Send message to main thread that the worker is ready
  self.postMessage('ready')

  // Setup message callback
  self.onmessage = async (event) => {
    // console.log('Web worker got message:', event.data)
    const { command } = event.data
    switch (command) {
      case 'setCanvas': {
        const { canvas } = event.data
        if (canvas && !offscreenCanvas) {
          offscreenCanvas = canvas
          drawingContext = offscreenCanvas.getContext('2d')
        }
        break
      }
      case 'renderForRelPos': {
        const { relX, relY } = event.data
        const currentActiveShape = mapDrawer.get_dynamic_shape_for_pos(
          drawingContext,
          relX,
          relY,
        )

        if (currentActiveShape != lastActiveShape) {
          for (var i = 0; i < 10; i++) {
            mapDrawer.draw_svg_with_x_y(drawingContext, relX, relY)
            await new Promise((r) => setTimeout(r, 50))
          }
        }
        lastActiveShape = currentActiveShape

        break
      }
      case 'evaluateClick': {
        const { relX, relY } = event.data
        const hoveredShape = mapDrawer.get_dynamic_shape_for_pos(
          drawingContext,
          relX,
          relY,
        )

        if (hoveredShape != null) {
          this.postMessage({ command: 'hoveredShape', shapeId: hoveredShape })
        }
        break
      }
      case 'setStateFillStyles': {
        const { fillStyles } = event.data
        for ({ state, style } of fillStyles) {
          mapDrawer.set_state_fill_style(state, style)
        }
        break
      }
      case 'setShapeStates': {
        const { shapeStates } = event.data
        for ({ shapeId, state } of shapeStates) {
          mapDrawer.set_shape_state(shapeId, state)
        }
        break
      }
    }
  }
}

init_wasm_in_worker()
