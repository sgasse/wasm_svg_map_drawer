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

  sendStateColorMap(drawWorker)
  sendShapeStates(drawWorker)

  setupWorkerListener(drawWorker)
  setupMousePosToMapSending(htmlCanvas, drawWorker)
  setupCanvasClick(htmlCanvas, drawWorker)

  drawWorker.postMessage({
    command: 'renderForRelPos',
    relX: 0.0,
    relY: 0.0,
  })
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

async function workerReady(worker) {
  await new Promise((resolve) =>
    worker.addEventListener('message', resolve, { once: true }),
  )
}

function setupWorkerListener(worker) {
  worker.addEventListener('message', (event) => {
    console.debug('Data received from worker: ', event.data)
    alert(`Clicked on shape ${event.data.shapeId}`)
  })
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

function setupMousePosToMapSending(htmlCanvas, worker) {
  htmlCanvas.addEventListener('mousemove', (event) => {
    relCanvasX = event.offsetX / htmlCanvas.clientWidth
    relCanvasY = event.offsetY / htmlCanvas.clientHeight
    mouseMoved = true
  })

  window.setInterval(() => {
    mouseMoved = false
    worker.postMessage({
      command: 'renderForRelPos',
      relX: relCanvasX,
      relY: relCanvasY,
    })
  }, 500)
}

function transferCanvas(htmlCanvas, worker) {
  let offscreen = htmlCanvas.transferControlToOffscreen()
  worker.postMessage({ command: 'setCanvas', canvas: offscreen }, [offscreen])
}

runMain()
