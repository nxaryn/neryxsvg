# NeryxSVG

SVG that is YOURS.

NeryxSVG is a browser-based SVG editor built for developers who want to create SVG graphics visually while still having precise control over the underlying SVG code.

Draw your SVG. Drag things around. Fine-tune coordinates. Export the result as pure SVG code.

No guessing coordinates. No fighting with awkward online editors. Just create and take the code with you.

## Live Version

The latest public version of NeryxSVG is available at:

[neryxsvg.web.app](neryxsvg.web.app)

You can use NeryxSVG directly in your browser without installing anything.

## Running Locally

NeryxSVG is also open source and can be pulled from this repository and run locally.

Clone the repository:

```
git clone https://github.com/nxaryn/neryxsvg.git
```

Open the project directory:

```
cd neryx-svg
```

Start a local web server:

```
python -m http.server
```

Then open the local address provided by the server in your browser.

This makes it possible to use NeryxSVG locally, modify the source code, experiment with new features, or host your own version.

## Features

* Interactive SVG canvas
* Cartesian-style coordinate grid
* SVG coordinate display
* Rectangle tool
* Circle tool
* Ellipse tool
* Line tool
* Polygon tool
* Polyline tool
* Path tool
* Text tool
* Fully draggable SVG elements
* Precise numerical editing
* Position and dimension controls
* Grid snapping
* Zoom and pan
* Element selection and manipulation
* Layers / element management
* Live SVG code output
* SVG code export
* Copy SVG directly to the clipboard
* Undo and redo
* Keyboard shortcuts
* Dark developer-focused interface

## The Core Idea

NeryxSVG is built around a simple workflow:

```
Draw → Drag → Fine-tune → Export
```

You can create an element visually and move it around naturally, then switch to numerical controls when you need exact positioning.

For example, instead of manually writing:

```
<circle cx="250" cy="150" r="50" />
```

you can simply draw the circle, drag it into position, and set:

```
X: 250
Y: 150
Radius: 50
```

NeryxSVG handles the SVG code for you.

## Why NeryxSVG?

SVG is incredibly useful, but manually creating complex SVG graphics can become annoying quickly.

Coordinates, paths, Bézier curves, control points, transforms, and dimensions can all become difficult to manage by hand.

Many online SVG editors also focus heavily on visual editing without giving developers enough control over the actual SVG source.

NeryxSVG aims to sit between the two.

You get the convenience of a visual editor while still working with real SVG elements and real SVG coordinates.

## Developer-focused

NeryxSVG is designed with developers in mind.

The goal isn't to hide the SVG code.

The goal is to make the code easier to create.

Everything you create should be usable as normal SVG code in:

* Websites
* Web applications
* Game interfaces
* UI designs
* Documentation
* Icons
* Illustrations
* Other SVG-compatible projects

No proprietary project format is required for the final result.

## Project Structure

The project is built as a web application and is intended to remain lightweight and easy to run.

```
neryxsvg/
├── index.html
├── css/
├── js/
├── assets/
└── README.md
```

## Ways to Use NeryxSVG

NeryxSVG can be used in several different ways.

### Use the public web app

Open the live version in your browser and start creating SVGs immediately.

No installation or setup is required.

### Run it locally

Clone the repository and run NeryxSVG using a local web server.

This is useful if you want to work offline, modify the application, or develop your own features.

### Modify and self-host

Because the project is available as source code, you can modify it and host your own version.

This means NeryxSVG can be used as:

* A ready-to-use web application
* A local development tool
* A base for your own SVG editor
* A learning resource for SVG and web development

## Roadmap

Planned improvements include:

* More advanced path editing
* Bézier curve controls
* Better multi-selection
* Alignment and distribution tools
* Rotation and transform controls
* SVG import
* Improved SVG source editing
* More snapping options
* Custom canvas sizes
* Custom viewBox editing
* Project saving
* More keyboard shortcuts
* Improved mobile support

## Contributing

NeryxSVG is an independent project.

If you find a bug, have an idea, or want to contribute, feel free to open an issue or pull request.

## License

License information will be added to this repository.

## NeryxSVG

SVG that is YOURS.
