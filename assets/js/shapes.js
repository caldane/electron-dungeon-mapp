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

Bitmap.prototype.draw = function (ctx, zoom) {
  ctx.drawImage(this.img, this.x, this.y, this.w * zoom, this.h * zoom);
}

NoHitShape.prototype.draw = function (ctx, zoom) {
  ctx.fillStyle = this.fill;
  ctx.fillRect(this.x, this.y, this.w * zoom, this.h * zoom);
}

// Draws this shape to a given context
Shape.prototype.draw = function (ctx) {
  ctx.fillStyle = this.fill;
  ctx.fillRect(this.x, this.y, this.w * zoom, this.h * zoom);
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

function CanvasState(canvas, buffer, backgroundFill, maskFill) {
  // **** First some setup! ****

  this.canvas = canvas;
  this.width = canvas.width;
  this.height = canvas.height;
  this.ctx = canvas.getContext('2d');
  this.buffer = buffer;
  this.bufferCtx = buffer.getContext('2d');
  this.bufferCtx.filter = 'blur(14px)';
  this.ZoomFactor = 1;
  // This complicates things a little but but fixes mouse co-ordinate problems
  // when there's a border or padding. See getMouse for more detail
  var stylePaddingLeft, stylePaddingTop, styleBorderLeft, styleBorderTop;
  if (document.defaultView && document.defaultView.getComputedStyle) {
    this.stylePaddingLeft = parseInt(document.defaultView.getComputedStyle(canvas, null)['paddingLeft'], 10) || 0;
    this.stylePaddingTop = parseInt(document.defaultView.getComputedStyle(canvas, null)['paddingTop'], 10) || 0;
    this.styleBorderLeft = parseInt(document.defaultView.getComputedStyle(canvas, null)['borderLeftWidth'], 10) || 0;
    this.styleBorderTop = parseInt(document.defaultView.getComputedStyle(canvas, null)['borderTopWidth'], 10) || 0;
  }
  // Some pages have fixed-position bars (like the stumbleupon bar) at the top or left of the page
  // They will mess up mouse coordinates and this fixes that
  var html = document.body.parentNode;
  this.htmlTop = html.offsetTop;
  this.htmlLeft = html.offsetLeft;

  // **** Keep track of state! ****

  this.valid = false; // when set to false, the canvas will redraw everything
  this.shapes = [];  // the collection of things to be drawn
  this.masks = [];
  this.mask = new Image();
  this.mask.ctx = this.bufferCtx;
  this.mask.onload = function () {
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    }
  }

  this.backgroundFill = backgroundFill;
  this.maskFill = maskFill;
  this.dragging = false; // Keep track of when we are dragging
  // the current selected object. In the future we could turn this into an array for multiple selection
  this.selection = null;
  this.dragoffx = 0; // See mousedown and mousemove events for explanation
  this.dragoffy = 0;

  // **** Then events! ****
  this.addEvents();
  // This is an example of a closure!
  // Right here "this" means the CanvasState. But we are making events on the Canvas itself,
  // and when the events are fired on the canvas the variable "this" is going to mean the canvas!
  // Since we still want to use this particular CanvasState in the events we have to save a reference to it.
  // This is our reference!
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
  var imgBuffer = 20;
  var bufferCtx = this.bufferCtx;
  var zoom = this.ZoomFactor;

  bufferCtx.globalCompositeOperation = 'source-over';
  bufferCtx.fillStyle = this.maskFill;
  bufferCtx.fillRect(-1 * imgBuffer, -1 * imgBuffer, this.buffer.width + (imgBuffer * 2), this.buffer.height + (imgBuffer * 2));
  bufferCtx.globalCompositeOperation = 'destination-out';
  for (var i = 0; i < this.masks.length; i++) {
    this.masks[i].draw(bufferCtx, zoom);
  }
  //bufferCtx.filter = 'blur(14px)';

  var maskData = this.buffer.toDataURL("image/png");
  this.mask.src = maskData;

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

    // ** Add stuff you want drawn in the background all the time here **
    if (this.backgroundFill !== null) {
      ctx.fillStyle = this.backgroundFill;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    // draw all shapes
    for (var i = 0; i < shapes.length; i++) {
      shapes[i].draw(ctx, zoom);
    }

    if (this.maskFill !== null) {
      ctx.drawImage(this.mask, shapes[0].x, shapes[0].y, shapes[0].w * zoom, shapes[0].h * zoom);
    }


    // draw selection
    // right now this is just a stroke along the edge of the selected Shape
    if (this.selection != null) {
      ctx.strokeStyle = this.selectionColor;
      ctx.lineWidth = this.selectionWidth;
      var mySel = this.selection;
      ctx.strokeRect(mySel.x, mySel.y, mySel.w * zoom, mySel.h * zoom);
    }

    // ** Add stuff you want drawn on top all the time here **

    this.valid = true;
  }
}


// Creates an object with x and y defined, set to the mouse position relative to the state's canvas
// If you wanna be super-correct this can be tricky, we have to worry about padding and borders
CanvasState.prototype.getMouse = function (e) {
  var element = this.canvas, offsetX = 0, offsetY = 0, mx, my;

  // Compute the total offset
  if (element.offsetParent !== undefined) {
    do {
      offsetX += element.offsetLeft;
      offsetY += element.offsetTop;
    } while ((element = element.offsetParent));
  }

  // Add padding and border style widths to offset
  // Also add the <html> offsets in case there's a position:fixed bar
  offsetX += this.stylePaddingLeft + this.styleBorderLeft + this.htmlLeft;
  offsetY += this.stylePaddingTop + this.styleBorderTop + this.htmlTop;

  mx = e.pageX - offsetX;
  my = e.pageY - offsetY;

  // We return a simple javascript object (a hash) with x and y defined
  return { x: mx, y: my };
}

CanvasState.prototype.invalidate = function () {
  this.valid = false;
}

CanvasState.prototype.addEvents = function () {
  canvas.addEventListener('selectstart', this);
  // Up, down, and move are for dragging
  canvas.addEventListener('mousedown', this);
  canvas.addEventListener('mousemove', this);
  canvas.addEventListener('mouseup', this);
  canvas.addEventListener("wheel", this);
}

CanvasState.prototype.removeEvents = function () {
  canvas.removeEventListener('selectstart', this);
  canvas.removeEventListener('mousedown', this);
  canvas.removeEventListener('mousemove', this);
  canvas.removeEventListener('mouseup', this);
}


CanvasState.prototype.handleEvent = function (e) {
  switch (e.type) {
    case 'selectstart': {
      e.preventDefault();
      return false;
    }
    case 'mousedown':
      MouseDown(e, this);
      break;

    case 'mousemove':
      MouseMove(e, this);
      break;

    case 'mouseup':
      MouseUp(e, this);
      break;

    case 'wheel':
      MouseWheel(e, this);
      break;
  }
}

// If you dont want to use <body onLoad='init()'>
// You could uncomment this init() reference and place the script reference inside the body tag
//init();

function init(canvas, img, buffer, backgroundFill, maskFill) {
  buffer.height = img.height;
  buffer.width = img.width;
  var s = new CanvasState(canvas, buffer, backgroundFill || '#656565', maskFill || '#2361c080');
  this.canvasState = s;
  console.log('fetching canvas');
  s.addImage(new Bitmap(img, 0, 0));
  s.addMask(new NoHitShape(20, 20, 100, 100, '#FF0000'));
  s.addMask(new NoHitShape(110, 160, 100, 100, '#FF0000'));
  return s;
}

function MouseDown(e, myState) {
  var mouse = myState.getMouse(e);
  var mx = mouse.x;
  var my = mouse.y;
  var shapes = myState.shapes;
  var l = shapes.length;
  for (var i = l - 1; i >= 0; i--) {
    if (shapes[i].contains(mx, my)) {
      var mySel = shapes[i];
      // Keep track of where in the object we clicked
      // so we can move it smoothly (see mousemove)
      myState.dragoffx = mx - mySel.x;
      myState.dragoffy = my - mySel.y;
      myState.dragging = true;
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
  if (myState.dragging) {
    var mouse = myState.getMouse(e);
    // We don't want to drag the object by its top-left corner, we want to drag it
    // from where we clicked. Thats why we saved the offset and use it here
    myState.selection.x = mouse.x - myState.dragoffx;
    myState.selection.y = mouse.y - myState.dragoffy;
    myState.valid = false; // Something's dragging so we must redraw
  }
}
function MouseUp(e, myState) {
  myState.dragging = false;
}
function MouseWheel(e, myState) {
  if (e.deltaY < 0) {
    factor = 1.2;
  }
  else {
    factor = .8;
  }

  myState.ZoomFactor *= factor;
  var map = myState.shapes[0];
  map.x = map.x * factor - e.x * (factor - 1);
  map.y = map.y * factor - (e.y - myState.canvas.offsetTop) * (factor - 1);

  myState.valid = false; // Something's dragging so we must redraw
}

// Now go make something amazing!
exports.init = init;

exports.drawMode = function () {
  this.canvasState.removeEvents();
}
exports.navigateMode = function () {
  this.canvasState.addEvents();
}
