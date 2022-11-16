# Climate Difference Explorer
A WebGPU Application written in TypeScript to visualize global temperature over time utilizing: jQuery, jQueryUI and Webpack.

## Run Application
The compiled website is placed inside the `dist` directory. You may just start `index.html`.

### Controls
* `U` Hides/Shows the UI

## Dev-Setup
The application is developed using the `npm`-Manager, so before you code you need to install [Node.js](https://nodejs.org/en/). To download the required packages execute the following command:
```
npm install 
```

That should be it. You can build the application by executing:
```
npm run dev
```

To generate a production build you may use `npm run prod`. If you wanna have hot-reload of your typescript and shader-files execute the watch script by calling: `npm run watch`.

### Dev-Environment
My recommendation is to code with Microsoft Visual Code and the following extensions:
* [WGSL](https://marketplace.visualstudio.com/items?itemName=PolyMeilex.wgsl): Code-Highlighting for Shader-Files
* [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer): Comes with a live reload feature. Paired with `npm run watch` perfect for quick development. Additional tip: Set the following properties:
```
    "liveServer.settings.AdvanceCustomBrowserCmdLine": "C:\\Users\\Vorto\\AppData\\Local\\Google\\Chrome SxS\\Application\\chrome.exe",
    "liveServer.settings.donotShowInfoMsg": true,
    "liveServer.settings.root": "/dist"
```
You can find the settings file with: `File`->`Preferences`->`Settings`->`Workspace`->`Extensions`->`Live Server Config`->`Edit in Settings json`. The second line has to point to your version of Chrome Canary.
