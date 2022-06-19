// Web worker to draw the canvas in a thread separate from the main thread.
// We use wasm for didactic purposes. The computations are not yet that heavy
// that they could not be done in JS.

// The worker has its own scope and no direct access to functions/objects of the global scope.
// We import the generated JS file to make `wasm_bindgen` available which we need to initialize
// our WASM code.
importScripts('./pkg/map_drawer.js')

// We transfer the canvas from the main thread as offscreen canvas. In the
// variables below, we store the canvas and the created 2d context.
var offscreenCanvas = null
var drawingContext = null

// To avoid redraws while we hover on the same (or no) shape, we store which
// shape was last hovered. To trigger an initial render when no shape is hovered
// we start with something other than `null`.
var lastActiveShape = 'init'

console.log('Initializing worker')

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
    const { command } = event.data
    // Handle message depending on the `command` string
    switch (command) {
      case 'setCanvas': {
        const { canvas } = event.data
        // Set offscreen canvas and 2d drawing context if not set
        if (canvas && !offscreenCanvas) {
          offscreenCanvas = canvas
          drawingContext = offscreenCanvas.getContext('2d')
        }
        break
      }
      case 'renderForRelPos': {
        const { relX, relY } = event.data
        // Check if the currently hovered shape changed
        const currentActiveShape = mapDrawer.get_dynamic_shape_for_pos(
          drawingContext,
          relX,
          relY,
        )

        if (currentActiveShape != lastActiveShape) {
          // Draw ten times in a loop with 50ms sleep
          // Together with an alpha factor of 0.2, this creates a neat fade-in
          // and fade-out effect
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
        // Check if any shape is below the click
        const hoveredShape = mapDrawer.get_dynamic_shape_for_pos(
          drawingContext,
          relX,
          relY,
        )

        // Send the ID of the hovered shape back to the main thread if there is
        // any
        if (hoveredShape != null) {
          this.postMessage({ command: 'hoveredShape', shapeId: hoveredShape })
        }
        break
      }
      case 'setStateFillStyles': {
        // Set the canvas fill styles per state
        const { fillStyles } = event.data
        for ({ state, style } of fillStyles) {
          mapDrawer.set_state_fill_style(state, style)
        }
        break
      }
      case 'setShapeStates': {
        // Set the states per shape ID
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
