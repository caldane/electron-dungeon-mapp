// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain } = require('electron')

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow
let childWindows = [];

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false
  })

  // and load the index.html of the app.
  mainWindow.loadFile('index.html')

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })
  console.log("init main window");
}

function createChildWindow(img) {
  const guid = require('uuid/v1');
  let childWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false
  });

  childWindow.loadFile('canvas.html');
  childWindow.on('closed', function () {
    console.log('Child window closed: ' + childWindow.guid);
    for (let i = 0; i < childWindows.length; i++) {
      if (childWindows[i].guid === childWindow.guid) {
        childWindows.splice(i, 1);
      }
    }
    childWindow = null;
  });

  childWindow.webContents.openDevTools();
  childWindow.guid = guid();
  console.log("windowId: " + childWindow.guid);
  childWindow.img = img;

  return childWindow;
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
ipcMain.on('quit', function () {
  app.quit();
})

ipcMain.on('minimize', function () {
  mainWindow.minimize();
})

ipcMain.on('new-child-window', function (event, arg) {
  let cw = createChildWindow(arg);
  console.log('[createChildWindow] id:' + cw.guid, arg);
  childWindows.push(cw);
})

ipcMain.on('close-child-window', function (event,  guid) {
  console.log('[close-child-window] id:' + guid);
  for (let i = 0; i < childWindows.length; i++) {
    if (childWindows[i].guid === guid) {
      childWindows[i].close();
      childWindows[i] = null;
      childWindows.splice(i, 1);
    }
  }
})

ipcMain.on('canvas-init', (event, ctx) => {
  console.log('[canvas-init]: ' + ctx.name);
  mainWindow.webContents.send('child-canvas-init', ctx);
});

ipcMain.on('set-child-mask', (event, arg) => {
  console.log('[set-child-mask] arg:' + arg.length);
  for (let i = 0; i < childWindows.length; i++) {
      childWindows[i].webContents.send('set-canvas-mask', arg);
  }
});

