// Main JS entry point, spawning the web worker and handling the interaction.

// Variables for throttled sending of the mouse position to the worker
var mouseMoved = false
var relCanvasX = 0.0
var relCanvasY = 0.0

async function runMain() {
  console.log('Running main routine')

  const drawWorker = new Worker('./worker.js')
  // Wait for a message from the worker that it is set up
  await workerReady(drawWorker)

  const htmlCanvas = document.getElementById('dynamic-map')
  transferCanvas(htmlCanvas, drawWorker)

  // Send shape state and fill styles to the worker before drawing.
  // States (and even fill styles) could be updated at any time.
  sendStateColorMap(drawWorker)
  sendShapeStates(drawWorker)

  // Setup listeners, timers and callbacks to regularily send the relative
  // mouse position and evaluate click positions on the canvas.
  setupWorkerListener(drawWorker)
  setupMousePosToMapSending(htmlCanvas, drawWorker)
  setupCanvasClick(htmlCanvas, drawWorker)

  // Trigger first render
  drawWorker.postMessage({
    command: 'renderForRelPos',
    relX: 0.0,
    relY: 0.0,
  })
}

async function workerReady(worker) {
  await new Promise((resolve) =>
    worker.addEventListener('message', resolve, { once: true }),
  )
}

function transferCanvas(htmlCanvas, worker) {
  // To have an unblocked main thread while we draw, we transfer the canvas to
  // the worker as `OffscreenCanvas`. This means the main thread can no longer
  // draw on the canvas itself.
  let offscreen = htmlCanvas.transferControlToOffscreen()
  worker.postMessage({ command: 'setCanvas', canvas: offscreen }, [offscreen])
}

function sendStateColorMap(worker) {
  worker.postMessage({
    command: 'setStateFillStyles',
    fillStyles: [
      { state: 0, style: 'rgba(47,47,47,0.2)' },
      { state: 1, style: 'rgba(153,255,153,0.2)' },
      { state: 2, style: 'rgba(255,153,153, 0.2)' },
      { state: 3, style: 'rgba(179,107,107,0.2)' },
      { state: 4, style: 'rgba(266,100,80,0.2)' },
      { state: 5, style: 'rgba(107,148,179,0.2)' },
    ],
  })
}

function sendShapeStates(worker) {
  worker.postMessage({
    command: 'setShapeStates',
    shapeStates: [
      { shapeId: 'dynamic_separate_desk', state: 1 },
      { shapeId: 'dynamic_conference_desk', state: 0 },
      { shapeId: 'dynamic_middle_desk_1', state: 1 },
      { shapeId: 'dynamic_middle_desk_2', state: 1 },
      { shapeId: 'dynamic_middle_desk_3', state: 2 },
      { shapeId: 'dynamic_middle_desk_4', state: 2 },
      { shapeId: 'dynamic_middle_desk_5', state: 1 },
      { shapeId: 'dynamic_middle_desk_6', state: 1 },
      { shapeId: 'dynamic_right_desk_1', state: 1 },
      { shapeId: 'dynamic_right_desk_2', state: 2 },
      { shapeId: 'dynamic_right_desk_3', state: 1 },
      { shapeId: 'dynamic_right_desk_4', state: 1 },
      { shapeId: 'dynamic_right_desk_5', state: 1 },
    ],
  })
}

function setupWorkerListener(worker) {
  worker.addEventListener('message', (event) => {
    console.debug('Data received from worker: ', event.data)
    alert(`Clicked on shape ${event.data.shapeId}`)
  })
}

function setupMousePosToMapSending(htmlCanvas, worker) {
  // To avoid issues with different scales of the HTML element and the canvas,
  // we send relative coordinates. Note that currently, we need the exact same
  // resolution to have the canvas perfectly overlayed on top of the SVG image.
  htmlCanvas.addEventListener('mousemove', (event) => {
    // Update the relative position and the flag that it was updated on every
    // movement but do not send it right away.
    relCanvasX = event.offsetX / htmlCanvas.clientWidth
    relCanvasY = event.offsetY / htmlCanvas.clientHeight
    mouseMoved = true
  })

  // Setup an interval for sending the relative mouse position to throttle the
  // amount of messages to process in the worker.
  window.setInterval(() => {
    mouseMoved = false
    worker.postMessage({
      command: 'renderForRelPos',
      relX: relCanvasX,
      relY: relCanvasY,
    })
  }, 250)
}

function setupCanvasClick(htmlCanvas, worker) {
  htmlCanvas.addEventListener('mousedown', (event) => {
    relCanvasX = event.offsetX / htmlCanvas.clientWidth
    relCanvasY = event.offsetY / htmlCanvas.clientHeight
    worker.postMessage({
      command: 'evaluateClick',
      relX: relCanvasX,
      relY: relCanvasY,
    })
  })
}

runMain()
