# slim-canvg

Blitting SVG to canvas is good for collision detection either with the mouse independant of DOM depth or for the collision between two SVG nodes. Unfortunately this isn't possible in IE without a lib like [canvg]([https://github.com/gabelerner/canvg). 

This is a fork of [canvg]([https://github.com/gabelerner/canvg) created mostly for use with drawing a contour of an entire svg tag to canvas. In most browsers (Chrome, Firefox, Safari) drawing SVG to canvas is easy:

1. get the SVG string
2. base64 encode it and prepend `data:image/svg+xml;base64,`
3. load the data uri into an image node (by setting its `src` attribute)
4. draw the new image to a canvas

(see the `examples/without-slim-canvg.html` to see the above four steps in action)

In IE9+, this technique fails with a security error.
