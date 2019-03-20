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
function Shape(x, y, w, h, fill) {
  // This is a very simple and unsafe constructor. All we're doing is checking if the values exist.
  // "x || 0" just means "if there is a value for x, use that. Otherwise use 0."
  // But we aren't checking anything else! We could put "Lalala" for the value of x 
  this.x = x || 0;
  this.y = y || 0;
  this.w = w || 1;
  this.h = h || 1;
  this.fill = fill || '#AAAAAA';
}

function Bitmap(img, x, y) {
  this.img = img;
  this.x = x || 0;
  this.y = y || 0;
  this.w = img.width;
  this.h = img.height;
}

function NoHitShape(x, y, w, h, fill) {
  this.x = x || 0;
  this.y = y || 0;
  this.w = w || 1;
  this.h = h || 1;
  this.fill = fill || '#656565';
}

function Polygon(points, fill) {
  this.points = points || [];
  this.fill = fill || 'black';
}

function MultipointLine(points, fill, line_width) {
  this.points = points || [];
  this.fill = fill || 'orange';
  this.line_width = line_width;
}

Bitmap.prototype.draw = function (ctx, myState) {
  let zoom = myState.ZoomFactor;
  ctx.drawImage(this.img, this.x, this.y, this.w * zoom, this.h * zoom);
}

NoHitShape.prototype.draw = function (ctx, myState) {
  let zoom = myState.ZoomFactor;
  let fillPoint = { x: this.x, y: this.y };
  ctx.fillStyle = this.fill;
  ctx.fillRect(fillPoint.x, fillPoint.y, this.w * zoom, this.h * zoom);
}

// Draws this shape to a given context
Shape.prototype.draw = function (ctx, myState) {
  let zoom = myState.ZoomFactor;
  let fillPoint = { x: this.x, y: this.y };
  ctx.fillStyle = this.fill;
  ctx.fillRect(fillPoint.x, fillPoint.y, this.w * zoom, this.h * zoom);
}

Polygon.prototype.draw = function (ctx, myState) {
  let region = new Path2D();
  region.moveTo(this.points[0].x, this.points[0].y);

  for (var i = 1; i < this.points.length; i++) {
    region.lineTo(this.points[i].x, this.points[i].y);
  }

  region.closePath();
  ctx.fillStyle = this.fill;
  ctx.fill(region);
}

MultipointLine.prototype.draw = function (ctx, myState) {
  let region = new Path2D();
  ctx.lineCap = "round";
  region.moveTo(this.points[0].x, this.points[0].y);

  for (var i = 1; i < this.points.length; i++) {
    region.lineTo(this.points[i].x, this.points[i].y);
  }

  ctx.strokeStyle = this.fill;
  ctx.lineWidth = this.line_width + 2;
  ctx.stroke(region);
}

Bitmap.prototype.contains = function (mx, my) {
  return (this.x <= mx) && (this.x + this.img.width >= mx) &&
    (this.y <= my) && (this.y + this.img.height >= my);
}

NoHitShape.prototype.contains = () => false;

// Determine if a point is inside the shape's bounds
Shape.prototype.contains = function (mx, my) {
  // All we have to do is make sure the Mouse X,Y fall in the area between
  // the shape's X and (X + Width) and its Y and (Y + Height)
  return (this.x <= mx) && (this.x + this.w >= mx) &&
    (this.y <= my) && (this.y + this.h >= my);
}

function CanvasState(canvas, backgroundFill, maskFill) {
  // **** First some setup! ****

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
    lines: []
  }

  this.valid = false; // when set to false, the canvas will redraw everything
  this.shapes = [];  // the collection of things to be drawn
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
  // the current selected object. In the future we could turn this into an array for multiple selection
  this.selection = null;
  this.dragoffx = 0; // See mousedown and mousemove events for explanation
  this.dragoffy = 0;

  // **** Then events! ****
  this.navEvents();

  var myState = this;


  // **** Options! ****

  this.selectionColor = '#CC0000';
  this.selectionWidth = 2;
  this.interval = 30;
  setInterval(function () { myState.draw(); }, myState.interval);
}

CanvasState.prototype.addShape = function (shape) {
  this.shapes.push(shape);
  this.valid = false;
}

CanvasState.prototype.addImage = function (img) {
  this.shapes.push(img);
  this.valid = false;
}

CanvasState.prototype.addBackground = function (background) {
  this.shapes.push(background);
  this.valid = false;
}

CanvasState.prototype.addMask = function (shape) {
  this.masks.push(shape);

  this.mask.image.src = this.createMaskImage(this.mask.fill, this);

  this.valid = false;
}

CanvasState.prototype.clear = function () {
  this.ctx.clearRect(0, 0, this.width, this.height);
}

// While draw is called as often as the INTERVAL variable demands,
// It only ever does something if the canvas gets invalidated by our code
CanvasState.prototype.draw = function () {
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

    // draw array of shapes on top of map
    for (var i = 0; i < shapes.length; i++) {
      shapes[i].draw(ctx, this);
    }

    // draw fog of war mask
    if (mask.fill !== null) {
      if (mask.image.src) {
        ctx.drawImage(mask.image, ws.x - gutter, ws.y - gutter, mask.canvas.width * zoom, mask.canvas.height * zoom);
      }
    }

    // draw current tool path
    if (tool.fill !== null) {
      if(tool.image.src && tool.isDrawing) {
        ctx.globalCompositeOperation = "overlay";
        ctx.drawImage(tool.image, 0 - gutter,0-gutter);
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

    // if (this.freeDraw.lines.length > 0) {
    //   drawLine(ctx, this.freeDraw);
    // }

    this.valid = true;
  }
}


// Creates an object with x and y defined, set to the mouse position relative to the state's canvas
// If you wanna be super-correct this can be tricky, we have to worry about padding and borders
CanvasState.prototype.getMouse = function (e) {
  var element = this.canvas, offsetY = 0, mx, my;

  offsetY = element.getBoundingClientRect().top;
  mx = e.pageX;// * 1.2;
  my = e.pageY - offsetY;

  return { x: mx, y: my };
}

CanvasState.prototype.screenToWorldSpace = function (point) {
  var zoom = this.ZoomFactor;
  let ws = this.worldSpace;

  if (!this.mapImage) { return point; };
  var coordinates = { x: (ws.x / zoom * -1) + (point.x / zoom), y: (ws.y / zoom * -1) + (point.y / zoom) };
  return coordinates;
}

CanvasState.prototype.invalidate = function () {
  this.valid = false;
}

CanvasState.prototype.navEvents = function () {
  this.eventsType = 'navigation';
  this.removeEvents();
  canvas.addEventListener('selectstart', this);
  // Up, down, and move are for dragging
  canvas.addEventListener('mousedown', this);
  canvas.addEventListener('mousemove', this);
  canvas.addEventListener('mouseup', this);
  canvas.addEventListener("wheel", this);
}

CanvasState.prototype.removeEvents = function () {
  this.mouse = null;
  canvas.removeEventListener('selectstart', this);
  canvas.removeEventListener('mousedown', this);
  canvas.removeEventListener('mousemove', this);
  canvas.removeEventListener('mouseup', this);
  canvas.removeEventListener("mouseout", this);
}

CanvasState.prototype.freeDrawEvents = function () {
  this.eventsType = 'free-draw';
  this.removeEvents();
  canvas.addEventListener("mousemove", this);
  canvas.addEventListener("mousedown", this);
  canvas.addEventListener("mouseup", this);
  canvas.addEventListener("mouseout", this);
}

CanvasState.prototype.createMaskImage = function (fill, myState) {
  var imgBuffer = 20;
  let buffer = myState.buffer;
  let bufferCtx = myState.bufferCtx;
  let maskLayers = myState.masks;

  bufferCtx.clearRect(0, 0, buffer.width, buffer.height);
  bufferCtx.globalCompositeOperation = 'source-over';
  bufferCtx.fillStyle = fill;
  bufferCtx.fillRect(-1 * imgBuffer, -1 * imgBuffer, buffer.width + (imgBuffer * 2), buffer.height + (imgBuffer * 2));
  bufferCtx.globalCompositeOperation = 'destination-out';
  for (var i = 0; i < maskLayers.length; i++) {
    maskLayers[i].draw(bufferCtx, myState);
  }

  return buffer.toDataURL("image/png");
}

CanvasState.prototype.createMaskImage2 = function (fillStyle, myState) {
  let gutter = myState.gutterSize;
  let ctx = myState.bufferCtx;
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
    ctx.fillStyle = fillStyle;
    ctx.fillRect(bufferWorldSpace.x, bufferWorldSpace.y, bufferWorldSpace.w, bufferWorldSpace.h);
    myState.mask.image.src = ctx.canvas.toDataURL("image/png");
    myState.invalidate();
  }

  img.src = myState.mask.canvas.toDataURL("image/png");
}


CanvasState.prototype.handleEvent = function (e) {
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

function findxy(res, e, myState) {
  var mouse = myState.getMouse(e);

  if (res == 'down') {
    if (e.which == 2) {
      MouseDown(e, myState);
    } else if (e.which == 1) {
      myState.freeDraw.lastDraw = mouse;
      myState.tool.isDrawing = true;
      myState.tool.ctx.beginPath();
      //myState.freeDraw.lines.push(mouse);
    }
  }
  if (res == 'up' || res == "out") {
    if (e.which == 2) {
      MouseUp(e, myState);
    } else if (e.which == 1) {
      let points = [];
      for (var i = 0; i < myState.freeDraw.lines.length; i++) {
        points.push(myState.screenToWorldSpace(myState.freeDraw.lines[i]));
      }
      if (myState.freeDraw.type === 'brush') {
        myState.createMaskImage2(myState.mask.fill, myState);
        //myState.addMask(new MultipointLine(points, "black", myState.freeDraw.line_width));
      } else if (myState.freeDraw.type === 'polygon') {
        myState.addMask(new Polygon(points, "black", myState.freeDraw.line_width));
      }
      myState.freeDraw.flag = false;
      myState.freeDraw.lines = [];
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
      var a = lastDraw.x - mouse.x;
      var b = lastDraw.y - mouse.y;
      var c = Math.sqrt(a * a + b * b);
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
        myState.freeDraw.lines.push({ x: mouse.x, y: mouse.y });
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

function drawLine(ctx, freeDraw) {
  let region = new Path2D();
  ctx.lineCap = "round";
  region.moveTo(freeDraw.lines[0].x, freeDraw.lines[0].y);
  for (var i = 1; i < freeDraw.lines.length; i++) {
    region.lineTo(freeDraw.lines[i].x, freeDraw.lines[i].y);
  }

  if (freeDraw.type == "polygon") {
    region.closePath();
  }
  ctx.fillStyle = freeDraw.fill_color;
  ctx.strokeStyle = freeDraw.line_color;
  ctx.lineWidth = freeDraw.line_width + 2;
  ctx.stroke(region);
  if (freeDraw.type == "polygon") {
    ctx.fill(region);
  }
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
  ctx.fillRect(0,0,ctx.canvas.width, ctx.canvas.height);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

// If you dont want to use <body onLoad='init()'>
// You could uncomment this init() reference and place the script reference inside the body tag
//init();

function init(canvas, backgroundFill, maskFill) {
  var s = new CanvasState(canvas, backgroundFill || '#656565', maskFill || '#2361c080');
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
exports.init = init;

exports.drawMode = function (drawType) {
  this.canvasState.freeDraw.type = drawType;
  var tempMouse = this.canvasState.lastKnownMouse;
  this.canvasState.freeDrawEvents();
  this.canvasState.mouse = tempMouse;
}
exports.navigateMode = function () {
  this.canvasState.freeDraw.type = 'nav';
  this.canvasState.navEvents();
}

exports.currentMode = function () {
  return this.canvasState.freeDraw.type;
}

exports.brushSizeUp = function () {
  this.canvasState.freeDraw.line_width += 1;
  this.canvasState.valid = false;
}

exports.brushSizeDown = function () {
  if (this.canvasState.freeDraw.line_width > 1) {
    this.canvasState.freeDraw.line_width -= 1;
  }
  this.canvasState.valid = false;
}

exports.refreshCanvas = function () {
  this.canvasState.valid = false;
}

exports.maskData = function (color) {
  return this.canvasState.createMaskImage(color, this.canvasState);
}

exports.setMask = function (img) {
  this.canvasState.mask.image.src = img;
  this.canvasState.invalidate();
}

exports.setMapp = function (img) {
  this.canvasState.buffer.height = img.height;
  this.canvasState.buffer.width = img.width;
  this.canvasState.mapImage = img;
  this.canvasState.valid = false;
}