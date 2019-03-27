// By Simon Sarris
// www.simonsarris.com
// sarris@acm.org
//
// Last update December 2011
//
// Free to use and distribute at will
// So long as you are nice to people, etc

// Constructor for Shape objects to hold data for all drawn objects.
// For now they will just be defined as rectangles.
import EventEmitter, { extend } from 'events';

class CanvasState extends EventEmitter {
  constructor(id, canvas, backgroundFill, maskFill) {
    super(); //must call super for "this" to be defined.
    // **** First some setup! ****
    this.id = id;
    this.canvas = canvas;
    this.width = canvas.width;
    this.height = canvas.height;
    this.ctx = canvas.getContext('2d');
    this.buffer = null;
    this.bufferCtx = null;
    this.gutterSize = 20;
    this.worldSpace = { x: 0, y: 0 };
    this.mapImage = new Image();
    this.ZoomFactor = 1;
    this.freeDraw = {
      line_color: "rgba(0,0,0,.5)",
      fill_color: "rgba(255,0,0,.5)",
      line_width: 120,
      lastDraw: { x: 0, y: 0 },
      points: []
    };
    this.valid = false; // when set to false, the canvas will redraw everything
    this.shapes = []; // the collection of things to be drawn
    this.masks = [];
    this.mask = {
      image: new Image(),
      canvas: null,
      ctx: null,
      fill: maskFill
    };
    this.tool = {
      buffer: null,
      ctx: null,
      mode: null,
      image: new Image()
    };
    this.mouse = null;
    this.lastKnownMouse = null;
    this.backgroundFill = backgroundFill;
    this.dragging = false; // Keep track of when we are dragging

    this.selection = null;
    this.dragoffx = 0; // See mousedown and mousemove events for explanation
    this.dragoffy = 0;
    var myState = this;
    extend(myState);
    // **** Then events! ****
    this.navEvents();
    this.mapImage.onload =  () => {
      let buffer = document.createElement('canvas');
      buffer.width = myState.mapImage.width + (myState.gutterSize * 2);
      buffer.height = myState.mapImage.height + (myState.gutterSize * 2);
      buffer.name = "buffer";
      myState.buffer = buffer;
      myState.bufferCtx = buffer.getContext('2d');
      myState.bufferCtx.name = myState.id + "-buffer-context";
      myState.bufferCtx.fillStyle = myState.mask.fill;
      myState.bufferCtx.filter = 'blur(14px)';

      let mask = document.createElement('canvas');
      mask.width = myState.mapImage.width + (myState.gutterSize * 2);
      mask.height = myState.mapImage.height + (myState.gutterSize * 2);
      mask.name = "mask";
      myState.mask.canvas = mask;
      myState.mask.ctx = mask.getContext('2d');
      myState.mask.ctx.fillRect(0, 0, mask.width, mask.height);
      myState.mask.ctx.globalCompositeOperation = 'destination-out';
      myState.createMaskImage2(myState, myState.bufferCtx);

      myState.emit("buffer-initialized", bufferCtx);
    };
    // **** Options! ****
    this.selectionColor = '#CC0000';
    this.selectionWidth = 2;
    this.interval = 30;
    setInterval(function () { myState.draw(); }, myState.interval);
  }
  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }
  // While draw is called as often as the INTERVAL variable demands,
  // It only ever does something if the canvas gets invalidated by our code
  draw() {
    // if our state is invalid, redraw and validate!
    if (!this.valid) {
      var ctx = this.ctx;
      var shapes = this.shapes;
      this.clear();
      var zoom = this.ZoomFactor;
      let ws = this.worldSpace;
      let map = this.mapImage;
      let gutter = this.gutterSize;
      let mask = this.mask;
      let tool = this.tool;

      // draw background
      if (this.backgroundFill !== null) {
        ctx.fillStyle = this.backgroundFill;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      }

      // draw map
      ctx.drawImage(map, ws.x, ws.y, map.width * zoom, map.height * zoom);

      // draw fog of war mask
      if (mask.fill !== null) {
        if (mask.image.src) {
          ctx.drawImage(mask.image, ws.x - gutter, ws.y - gutter, mask.canvas.width * zoom, mask.canvas.height * zoom);
        }
      }

      // draw current tool path
      if (tool.fill !== null) {
        if (tool.image.src && tool.isDrawing) {
          ctx.globalCompositeOperation = "overlay";
          ctx.drawImage(tool.image, 0 - gutter, 0 - gutter);
        }
      }

      ctx.globalCompositeOperation = "source-over";

      // draw selection
      // right now this is just a stroke along the edge of the selected Shape
      if (this.selection != null) {
        ctx.strokeStyle = this.selectionColor;
        ctx.lineWidth = this.selectionWidth;
        var mySel = this.selection;
        ctx.strokeRect(mySel.x, mySel.y, mySel.w * zoom, mySel.h * zoom);
      }

      // draw tool cursor
      if (this.mouse !== null) {
        ctx.strokeStyle = "black";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.mouse.x, this.mouse.y, this.freeDraw.line_width / 2, 0, 2 * Math.PI);
        ctx.stroke();
        if (this.freeDraw.type === "polygon") {
          ctx.fillStyle = this.freeDraw.fill_color;
          ctx.fill();
        }
      }
      this.valid = true;
    }
  }

  getMouse(e) {
    var element = this.canvas, offsetY = 0, mx, my;
    offsetY = element.getBoundingClientRect().top;
    mx = e.pageX; // * 1.2;
    my = e.pageY - offsetY;
    return { x: mx, y: my };
  }

  screenToWorldSpace(point) {
    var zoom = this.ZoomFactor;
    let ws = this.worldSpace;

    if (!this.mapImage) {
      return point;
    }

    var coordinates = { x: (ws.x / zoom * -1) + (point.x / zoom), y: (ws.y / zoom * -1) + (point.y / zoom) };
    return coordinates;
  }

  invalidate() {
    this.valid = false;
  }

  navEvents() {
    this.eventsType = 'navigation';
    this.removeEvents();
    this.canvas.addEventListener('selectstart', this);
    // Up, down, and move are for dragging
    this.canvas.addEventListener('mousedown', this);
    this.canvas.addEventListener('mousemove', this);
    this.canvas.addEventListener('mouseup', this);
    this.canvas.addEventListener("wheel", this);
  }

  removeEvents() {
    this.mouse = null;
    this.canvas.removeEventListener('selectstart', this);
    this.canvas.removeEventListener('mousedown', this);
    this.canvas.removeEventListener('mousemove', this);
    this.canvas.removeEventListener('mouseup', this);
    this.canvas.removeEventListener("mouseout", this);
  }

  freeDrawEvents() {
    this.eventsType = 'free-draw';
    this.removeEvents();
    this.canvas.addEventListener("mousemove", this);
    this.canvas.addEventListener("mousedown", this);
    this.canvas.addEventListener("mouseup", this);
    this.canvas.addEventListener("mouseout", this);
  }

  createMaskImage2(myState, bufferCtx) {
    let ctx = bufferCtx;
    let img = new Image();
    let bufferWorldSpace = {
      x: 0,
      y: 0,
      w: ctx.canvas.width,
      h: ctx.canvas.height
    };

    img.onload = function () {
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(bufferWorldSpace.x, bufferWorldSpace.y, bufferWorldSpace.w, bufferWorldSpace.h);
      ctx.drawImage(img, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillRect(bufferWorldSpace.x, bufferWorldSpace.y, bufferWorldSpace.w, bufferWorldSpace.h);
      myState.mask.image.src = ctx.canvas.toDataURL("image/png");
      myState.invalidate();
    };

    img.src = myState.mask.canvas.toDataURL("image/png");
  }
  
  handleEvent(e) {
    switch (this.eventsType + "-" + e.type) {
      case 'navigation-selectstart': {
        e.preventDefault();
        return false;
      }
      case 'navigation-mousedown':
        MouseDown(e, this);
        break;
      case 'navigation-mousemove':
        MouseMove(e, this);
        break;
      case 'navigation-mouseup':
        MouseUp(e, this);
        break;
      case 'navigation-wheel':
        MouseWheel(e, this);
        break;
      case 'free-draw-mousemove':
        findxy('move', e, this);
        break;
      case 'free-draw-mousedown':
        findxy('down', e, this);
        break;
      case 'free-draw-mouseout':
        findxy('out', e, this);
        break;
      case 'free-draw-mouseup':
        findxy('up', e, this);
        break;
    }
  }
}


















function findxy(res, e, myState) {
  var mouse = myState.getMouse(e);

  if (res == 'down') {
    if (e.which == 2) {
      MouseDown(e, myState);
    } else if (e.which == 1) {
      myState.freeDraw.points = [];
      myState.freeDraw.lastDraw = mouse;
      myState.tool.isDrawing = true;
      myState.tool.ctx.beginPath();
    }
  }
  if (res == 'up' || res == "out") {
    if (e.which == 2) {
      MouseUp(e, myState);
    } else if (e.which == 1) {
      if (myState.freeDraw.type === 'polygon') {
        drawMaskPolygon(myState.mask.ctx, myState.freeDraw.points, myState.freeDraw.line_width, "#000000ff", "#000000ff");
      }

      myState.createMaskImage2(myState, myState.bufferCtx);

      myState.freeDraw.flag = false;
      myState.tool.isDrawing = false;
      myState.tool.ctx.closePath();
      clearContext(myState.tool.ctx);
    }
  }
  if (res == 'move') {
    if (e.which == 2) {
      MouseMove(e, myState);
    }
    if (e.which == 1) {
      let lastDraw = myState.freeDraw.lastDraw;
      let a = lastDraw.x - mouse.x;
      let b = lastDraw.y - mouse.y;
      let c = Math.sqrt(a * a + b * b);

      if (myState.freeDraw.type === 'brush') {
        if (c < myState.freeDraw.line_width / 2) {
          drawMaskArc(myState.tool.ctx, mouse, myState.freeDraw.line_width / 2, "#333333ff");
          drawMaskArc(myState.mask.ctx, myState.screenToWorldSpace(mouse), myState.freeDraw.line_width / 2, "#000000ff");
          myState.tool.image.src = myState.tool.buffer.toDataURL("image/png");
        } else {
          drawMaskLine(myState.tool.ctx, lastDraw, mouse, myState.freeDraw.line_width, "#333333ff");
          drawMaskLine(myState.mask.ctx, myState.screenToWorldSpace(lastDraw), myState.screenToWorldSpace(mouse), myState.freeDraw.line_width, "#000000ff");
        }
      } else if (myState.freeDraw.type === 'polygon') {
        if (c > myState.freeDraw.line_width / 10) {
          clearContext(myState.tool.ctx);
          myState.freeDraw.points.push(myState.screenToWorldSpace({ x: mouse.x + myState.gutterSize, y: mouse.y + myState.gutterSize }));
          drawMaskPolygon(myState.tool.ctx, myState.freeDraw.points, myState.freeDraw.line_width, "#333333ff", "#666666ff");
          myState.tool.image.src = myState.tool.buffer.toDataURL("image/png");
        }
      }

      myState.freeDraw.lastDraw.x = mouse.x;
      myState.freeDraw.lastDraw.y = mouse.y;
      myState.valid = false;
    } else {
      myState.mouse = myState.getMouse(e);
      myState.lastKnownMouse = myState.getMouse(e);
      myState.valid = false;
    }
  }
}

function drawMaskPolygon(ctx, points, lineWidth, fillStyle, strokeStyle) {
  let region = new Path2D();
  ctx.lineCap = "round";
  region.moveTo(points[0].x, points[0].y);
  for (var i = 1; i < points.length; i++) {
    region.lineTo(points[i].x, points[i].y);
  }

  region.closePath();
  ctx.fillStyle = fillStyle;
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth + 2;
  ctx.stroke(region);
  ctx.fill(region);
}

function drawMaskArc(ctx, mouse, radius, fillStyle) {
  ctx.fillStyle = fillStyle;
  ctx.moveTo(mouse.x, mouse.y);
  ctx.arc(mouse.x, mouse.y, radius, 0, 2 * Math.PI);
  ctx.fill();
}

function drawMaskLine(ctx, point1, point2, line_width, fillStyle) {
  let line = new Path2D();
  ctx.lineCap = "round";
  ctx.strokeStyle = fillStyle;
  line.moveTo(point1.x, point1.y);
  line.lineTo(point2.x, point2.y);

  ctx.lineWidth = line_width;
  ctx.stroke(line);
}

function clearContext(ctx) {
  ctx.globalCompositeOperation = "source-over";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

// If you dont want to use <body onLoad='init()'>
// You could uncomment this init() reference and place the script reference inside the body tag
//init();

function init(id, canvas, backgroundFill, maskFill) {
  var s = new CanvasState(id, canvas, backgroundFill || '#656565', maskFill || '#2361c080');
  this.canvasState = s;
  console.log('fetching canvas');
  s.invalidate();
  return s;
}

function MouseDown(e, myState) {
  var mouse = myState.getMouse(e);
  var mx = mouse.x;
  var my = mouse.y;
  var shapes = myState.shapes;
  var l = shapes.length;
  let ws = myState.worldSpace;

  myState.dragoffx = mx - ws.x;
  myState.dragoffy = my - ws.y;
  myState.dragging = true;

  for (var i = l - 1; i >= 0; i--) {
    if (shapes[i].contains(mx, my)) {
      var mySel = shapes[i];
      // Keep track of where in the object we clicked
      // so we can move it smoothly (see mousemove)

      myState.dragoffx = mx - mySel.x;
      myState.dragoffy = my - mySel.y;
      myState.selection = mySel;
      myState.valid = false;
      return;
    }
  }
  // havent returned means we have failed to select anything.
  // If there was an object selected, we deselect it
  if (myState.selection) {
    myState.selection = null;
    myState.valid = false; // Need to clear the old selection border
  }
}
function MouseMove(e, myState) {
  myState.lastKnownMouse = myState.getMouse(e);
  if (myState.dragging) {
    var mouse = myState.lastKnownMouse;

    // We don't want to drag the object by its top-left corner, we want to drag it
    // from where we clicked. Thats why we saved the offset and use it here
    if (myState.selection !== null) {
      myState.selection.x = mouse.x - myState.dragoffx;
      myState.selection.y = mouse.y - myState.dragoffy;

    } else {
      myState.worldSpace = { x: mouse.x - myState.dragoffx, y: mouse.y - myState.dragoffy };
    }
    myState.valid = false; // Something's dragging so we must redraw
  }
}
function MouseUp(e, myState) {
  myState.dragging = false;
}
function MouseWheel(e, myState) {
  const factor = e.deltaY < 0 ? 1.2 : .8;

  myState.ZoomFactor *= factor;
  let ws = this.worldSpace;
  ws.x = ws.x * factor - e.x * (factor - 1);
  ws.y = ws.y * factor - (e.y - myState.canvas.offsetTop) * (factor - 1);

  myState.valid = false;
}

// Now go make something amazing!
const _init = init;
export { _init as init };

export function drawMode (drawType) {
  this.canvasState.freeDraw.type = drawType;
  var tempMouse = this.canvasState.lastKnownMouse;
  this.canvasState.freeDrawEvents();
  this.canvasState.mouse = tempMouse;
}
export function navigateMode () {
  this.canvasState.freeDraw.type = 'nav';
  this.canvasState.navEvents();
}

export function currentMode () {
  return this.canvasState.freeDraw.type;
}

export function brushSizeUp () {
  this.canvasState.freeDraw.line_width += 1;
  this.canvasState.valid = false;
}

export function brushSizeDown () {
  if (this.canvasState.freeDraw.line_width > 1) {
    this.canvasState.freeDraw.line_width -= 1;
  }
  this.canvasState.valid = false;
}

export function refreshCanvas () {
  this.canvasState.valid = false;
}

export function maskData (bufferCtx) {
  this.canvasState.createMaskImage2(this.canvasState, bufferCtx);
}

export function setMask (img) {
  this.canvasState.mask.image.src = img;
  this.canvasState.invalidate();
}

export function setMapp (img) {
  this.canvasState.buffer.height = img.height;
  this.canvasState.buffer.width = img.width;
  this.canvasState.mapImage = img;
  this.canvasState.valid = false;
}