/*
 * canvg.js - Javascript SVG parser and renderer on Canvas
 * MIT Licensed
 * Gabe Lerner (gabelerner@gmail.com)
 * http://code.google.com/p/canvg/
 *
 * Requires: rgbcolor.js - http://www.phpied.com/rgb-color-parser-in-javascript/
 */
(function (global, factory) {
  'use strict';
  // export as AMD...
  if (typeof define !== 'undefined' && define.amd) {
    define('canvgModule', [], factory);
  }  // ...or as browserify
  else if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  }
  global.canvg = factory();
}(typeof window !== 'undefined' ? window : this, function () {
  // canvg(target, s)
  // empty parameters: replace all 'svg' elements on page with 'canvas' elements
  // target: canvas element or the id of a canvas element
  // s: svg string, url to svg file, or xml document
  // opts: optional hash of options
  //     ignoreMouse: true => ignore mouse events
  //     ignoreAnimation: true => ignore animations
  //     ignoreDimensions: true => does not try to resize canvas
  //     ignoreClear: true => does not clear canvas
  //     offsetX: int => draws at a x offset
  //     offsetY: int => draws at a y offset
  //     scaleWidth: int => scales horizontally to width
  //     scaleHeight: int => scales vertically to height
  //     renderCallback: function => will call the function after the first render is completed
  var canvg = function (target, s, opts) {
    s = s.trim();
    if (typeof target == 'string') {
      target = document.getElementById(target);
    }
    // store class on canvas
    if (target.svg != null)
      target.svg.stop();

    var svg = build(opts || {});
    // on i.e. 8 for flash canvas, we can't assign the property so check for it
    if (!(target.childNodes.length == 1 && target.childNodes[0].nodeName == 'OBJECT'))
      target.svg = svg;
    var ctx = target.getContext('2d');
    if (typeof s.documentElement != 'undefined') {
      // load from xml doc
      svg.loadXmlDoc(ctx, s);
    } else if (s.substr(0, 1) == '<') {
      // load from xml string
      svg.loadXml(ctx, s);
    }
  };
  // see https://developer.mozilla.org/en-US/docs/Web/API/Element.matches

  // @TODO use ors
  var matchesSelector;
  if (typeof Element.prototype.matches != 'undefined') {
    matchesSelector = function (node, selector) {
      return node.matches(selector);
    };
  } else if (typeof Element.prototype.webkitMatchesSelector != 'undefined') {
    matchesSelector = function (node, selector) {
      return node.webkitMatchesSelector(selector);
    };
  } else if (typeof Element.prototype.mozMatchesSelector != 'undefined') {
    matchesSelector = function (node, selector) {
      return node.mozMatchesSelector(selector);
    };
  } else if (typeof Element.prototype.msMatchesSelector != 'undefined') {
    matchesSelector = function (node, selector) {
      return node.msMatchesSelector(selector);
    };
  } else if (typeof Element.prototype.oMatchesSelector != 'undefined') {
    matchesSelector = function (node, selector) {
      return node.oMatchesSelector(selector);
    };
  }
  // slightly modified version of https://github.com/keeganstreet/specificity/blob/master/specificity.js
  var attributeRegex = /(\[[^\]]+\])/g;
  var idRegex = /(#[^\s\+>~\.\[:]+)/g;
  var classRegex = /(\.[^\s\+>~\.\[:]+)/g;
  var pseudoElementRegex = /(::[^\s\+>~\.\[:]+|:first-line|:first-letter|:before|:after)/gi;
  var pseudoClassWithBracketsRegex = /(:[\w-]+\([^\)]*\))/gi;
  var pseudoClassRegex = /(:[^\s\+>~\.\[:]+)/g;
  var elementRegex = /([^\s\+>~\.\[:]+)/g;
  function getSelectorSpecificity(selector) {
    var typeCount = [
      0,
      0,
      0
    ];
    var findMatch = function (regex, type) {
      var matches = selector.match(regex);
      if (matches == null) {
        return;
      }
      typeCount[type] += matches.length;
      selector = selector.replace(regex, ' ');
    };
    selector = selector.replace(/:not\(([^\)]*)\)/g, '     $1 ');
    selector = selector.replace(/{[^]*/gm, ' ');
    findMatch(attributeRegex, 1);
    findMatch(idRegex, 0);
    findMatch(classRegex, 1);
    findMatch(pseudoElementRegex, 2);
    findMatch(pseudoClassWithBracketsRegex, 1);
    findMatch(pseudoClassRegex, 1);
    selector = selector.replace(/[\*\s\+>~]/g, ' ');
    selector = selector.replace(/[#\.]/g, ' ');
    findMatch(elementRegex, 2);
    return typeCount.join('');
  }
  function build(opts) {
    var svg = { opts: opts };

    svg.MAX_VIRTUAL_PIXELS = 30000;
    svg.log = function (msg) {
    };
    if (svg.opts.log == true && typeof console != 'undefined') {
      svg.log = function (msg) {
        console.log(msg);
      };
    }
    // globals
    svg.init = function (ctx) {
      var uniqueId = 0;
      svg.UniqueId = function () {
        uniqueId++;
        return 'canvg' + uniqueId;
      };
      svg.Definitions = {};
      svg.Styles = {};
      svg.StylesSpecificity = {};
      svg.ctx = ctx;
      svg.ViewPort = new function () {
        this.viewPorts = [];
        this.Clear = function () {
          this.viewPorts = [];
        };
        this.SetCurrent = function (width, height) {
          this.viewPorts.push({
            width: width,
            height: height
          });
        };
        this.RemoveCurrent = function () {
          this.viewPorts.pop();
        };
        this.Current = function () {
          return this.viewPorts[this.viewPorts.length - 1];
        };
        this.width = function () {
          return this.Current().width;
        };
        this.height = function () {
          return this.Current().height;
        };
        this.ComputeSize = function (d) {
          if (d != null && typeof d == 'number')
            return d;
          if (d == 'x')
            return this.width();
          if (d == 'y')
            return this.height();
          return Math.sqrt(Math.pow(this.width(), 2) + Math.pow(this.height(), 2)) / Math.sqrt(2);
        };
      }();
    };
    svg.init();

    svg.trim = function (s) {
      return s.replace(/^\s+|\s+$/g, '');
    };
    // compress spaces
    svg.compressSpaces = function (s) {
      return s.replace(/[\s\r\t\n]+/gm, ' ');
    };

    // parse xml
    svg.parseXml = function (xml) {
      if (typeof Windows != 'undefined' && typeof Windows.Data != 'undefined' && typeof Windows.Data.Xml != 'undefined') {
        var xmlDoc = new Windows.Data.Xml.Dom.XmlDocument();
        var settings = new Windows.Data.Xml.Dom.XmlLoadSettings();
        settings.prohibitDtd = false;
        xmlDoc.loadXml(xml, settings);
        return xmlDoc;
      } else if (window.DOMParser) {
        var parser = new DOMParser();
        return parser.parseFromString(xml, 'text/xml');
      } else {
        xml = xml.replace(/<!DOCTYPE svg[^>]*>/, '');
        var xmlDoc = new ActiveXObject('Microsoft.XMLDOM');
        xmlDoc.async = 'false';
        xmlDoc.loadXML(xml);
        return xmlDoc;
      }
    };
    svg.Property = function (name, value) {
      this.name = name;
      this.value = value;
    };
    svg.Property.prototype.getValue = function () {
      return this.value;
    };
    svg.Property.prototype.hasValue = function () {
      return this.value != null && this.value !== '';
    };
    // return the numerical value of the property
    svg.Property.prototype.numValue = function () {
      if (!this.hasValue())
        return 0;
      var n = parseFloat(this.value);
      if ((this.value + '').match(/%$/)) {
        n = n / 100;
      }
      return n;
    };
    svg.Property.prototype.valueOrDefault = function (def) {
      if (this.hasValue())
        return this.value;
      return def;
    };
    svg.Property.prototype.numValueOrDefault = function (def) {
      if (this.hasValue())
        return this.numValue();
      return def;
    };

    svg.Property.prototype.getDefinition = function () {
      var name = this.value.match(/#([^\)'"]+)/);
      if (name) {
        name = name[1];
      }
      if (!name) {
        name = this.value;
      }
      return svg.Definitions[name];
    };
    svg.Property.prototype.isUrlDefinition = function () {
      return this.value.indexOf('url(') == 0;
    };

    // length extensions
    svg.Property.prototype.getDPI = function (viewPort) {
      return 96;  // TODO: compute?
    };
    svg.Property.prototype.getEM = function (viewPort) {
      var em = 12;
      var fontSize = new svg.Property('fontSize', svg.Font.Parse(svg.ctx.font).fontSize);
      if (fontSize.hasValue())
        em = fontSize.toPixels(viewPort);
      return em;
    };
    svg.Property.prototype.getUnits = function () {
      var s = this.value + '';
      return s.replace(/[0-9\.\-]/g, '');
    };
    // get the length as pixels
    svg.Property.prototype.toPixels = function (viewPort, processPercent) {
      if (!this.hasValue())
        return 0;
      var s = this.value + '';
      if (s.match(/em$/))
        return this.numValue() * this.getEM(viewPort);
      if (s.match(/ex$/))
        return this.numValue() * this.getEM(viewPort) / 2;
      if (s.match(/px$/))
        return this.numValue();
      if (s.match(/pt$/))
        return this.numValue() * this.getDPI(viewPort) * (1 / 72);
      if (s.match(/pc$/))
        return this.numValue() * 15;
      if (s.match(/cm$/))
        return this.numValue() * this.getDPI(viewPort) / 2.54;
      if (s.match(/mm$/))
        return this.numValue() * this.getDPI(viewPort) / 25.4;
      if (s.match(/in$/))
        return this.numValue() * this.getDPI(viewPort);
      if (s.match(/%$/))
        return this.numValue() * svg.ViewPort.ComputeSize(viewPort);
      var n = this.numValue();
      if (processPercent && n < 1)
        return n * svg.ViewPort.ComputeSize(viewPort);
      return n;
    };

    // angle extensions
    // get the angle as radians
    svg.Property.prototype.toRadians = function () {
      if (!this.hasValue())
        return 0;
      var s = this.value + '';
      if (s.match(/deg$/))
        return this.numValue() * (Math.PI / 180);
      if (s.match(/grad$/))
        return this.numValue() * (Math.PI / 200);
      if (s.match(/rad$/))
        return this.numValue();
      return this.numValue() * (Math.PI / 180);
    };

    // points and paths
    svg.ToNumberArray = function (s) {
      var a = svg.trim(svg.compressSpaces((s || '').replace(/,/g, ' '))).split(' ');
      for (var i = 0; i < a.length; i++) {
        a[i] = parseFloat(a[i]);
      }
      return a;
    };
    svg.Point = function (x, y) {
      this.x = x;
      this.y = y;
    };
    svg.Point.prototype.angleTo = function (p) {
      return Math.atan2(p.y - this.y, p.x - this.x);
    };
    svg.Point.prototype.applyTransform = function (v) {
      var xp = this.x * v[0] + this.y * v[2] + v[4];
      var yp = this.x * v[1] + this.y * v[3] + v[5];
      this.x = xp;
      this.y = yp;
    };
    svg.CreatePoint = function (s) {
      var a = svg.ToNumberArray(s);
      return new svg.Point(a[0], a[1]);
    };
    svg.CreatePath = function (s) {
      var a = svg.ToNumberArray(s);
      var path = [];
      for (var i = 0; i < a.length; i += 2) {
        path.push(new svg.Point(a[i], a[i + 1]));
      }
      return path;
    };
    // bounding box
    svg.BoundingBox = function (x1, y1, x2, y2) {
      // pass in initial points if you want
      this.x1 = Number.NaN;
      this.y1 = Number.NaN;
      this.x2 = Number.NaN;
      this.y2 = Number.NaN;
      this.x = function () {
        return this.x1;
      };
      this.y = function () {
        return this.y1;
      };
      this.width = function () {
        return this.x2 - this.x1;
      };
      this.height = function () {
        return this.y2 - this.y1;
      };
      this.addPoint = function (x, y) {
        if (x != null) {
          if (isNaN(this.x1) || isNaN(this.x2)) {
            this.x1 = x;
            this.x2 = x;
          }
          if (x < this.x1)
            this.x1 = x;
          if (x > this.x2)
            this.x2 = x;
        }
        if (y != null) {
          if (isNaN(this.y1) || isNaN(this.y2)) {
            this.y1 = y;
            this.y2 = y;
          }
          if (y < this.y1)
            this.y1 = y;
          if (y > this.y2)
            this.y2 = y;
        }
      };
      this.addX = function (x) {
        this.addPoint(x, null);
      };
      this.addY = function (y) {
        this.addPoint(null, y);
      };
      this.addBoundingBox = function (bb) {
        this.addPoint(bb.x1, bb.y1);
        this.addPoint(bb.x2, bb.y2);
      };
      this.addQuadraticCurve = function (p0x, p0y, p1x, p1y, p2x, p2y) {
        var cp1x = p0x + 2 / 3 * (p1x - p0x);
        // CP1 = QP0 + 2/3 *(QP1-QP0)
        var cp1y = p0y + 2 / 3 * (p1y - p0y);
        // CP1 = QP0 + 2/3 *(QP1-QP0)
        var cp2x = cp1x + 1 / 3 * (p2x - p0x);
        // CP2 = CP1 + 1/3 *(QP2-QP0)
        var cp2y = cp1y + 1 / 3 * (p2y - p0y);
        // CP2 = CP1 + 1/3 *(QP2-QP0)
        this.addBezierCurve(p0x, p0y, cp1x, cp2x, cp1y, cp2y, p2x, p2y);
      };
      this.addBezierCurve = function (p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y) {
        // from http://blog.hackers-cafe.net/2009/06/how-to-calculate-bezier-curves-bounding.html
        var p0 = [
            p0x,
            p0y
          ], p1 = [
            p1x,
            p1y
          ], p2 = [
            p2x,
            p2y
          ], p3 = [
            p3x,
            p3y
          ];
        this.addPoint(p0[0], p0[1]);
        this.addPoint(p3[0], p3[1]);
        for (i = 0; i <= 1; i++) {
          var f = function (t) {
            return Math.pow(1 - t, 3) * p0[i] + 3 * Math.pow(1 - t, 2) * t * p1[i] + 3 * (1 - t) * Math.pow(t, 2) * p2[i] + Math.pow(t, 3) * p3[i];
          };
          var b = 6 * p0[i] - 12 * p1[i] + 6 * p2[i];
          var a = -3 * p0[i] + 9 * p1[i] - 9 * p2[i] + 3 * p3[i];
          var c = 3 * p1[i] - 3 * p0[i];
          if (a == 0) {
            if (b == 0)
              continue;
            var t = -c / b;
            if (0 < t && t < 1) {
              if (i == 0)
                this.addX(f(t));
              if (i == 1)
                this.addY(f(t));
            }
            continue;
          }
          var b2ac = Math.pow(b, 2) - 4 * c * a;
          if (b2ac < 0)
            continue;
          var t1 = (-b + Math.sqrt(b2ac)) / (2 * a);
          if (0 < t1 && t1 < 1) {
            if (i == 0)
              this.addX(f(t1));
            if (i == 1)
              this.addY(f(t1));
          }
          var t2 = (-b - Math.sqrt(b2ac)) / (2 * a);
          if (0 < t2 && t2 < 1) {
            if (i == 0)
              this.addX(f(t2));
            if (i == 1)
              this.addY(f(t2));
          }
        }
      };
      this.isPointInBox = function (x, y) {
        return this.x1 <= x && x <= this.x2 && this.y1 <= y && y <= this.y2;
      };
      this.addPoint(x1, y1);
      this.addPoint(x2, y2);
    };
    // transforms
    svg.Transform = function (v) {
      var that = this;
      this.Type = {};
      // translate
      this.Type.translate = function (s) {
        this.p = svg.CreatePoint(s);
        this.apply = function (ctx) {
          ctx.translate(this.p.x || 0, this.p.y || 0);
        };
        this.unapply = function (ctx) {
          ctx.translate(-1 * this.p.x || 0, -1 * this.p.y || 0);
        };
        this.applyToPoint = function (p) {
          p.applyTransform([
            1,
            0,
            0,
            1,
            this.p.x || 0,
            this.p.y || 0
          ]);
        };
      };
      // rotate
      this.Type.rotate = function (s) {
        var a = svg.ToNumberArray(s);
        this.angle = new svg.Property('angle', a[0]);
        this.cx = a[1] || 0;
        this.cy = a[2] || 0;
        this.apply = function (ctx) {
          ctx.translate(this.cx, this.cy);
          ctx.rotate(this.angle.toRadians());
          ctx.translate(-this.cx, -this.cy);
        };
        this.unapply = function (ctx) {
          ctx.translate(this.cx, this.cy);
          ctx.rotate(-1 * this.angle.toRadians());
          ctx.translate(-this.cx, -this.cy);
        };
        this.applyToPoint = function (p) {
          var a = this.angle.toRadians();
          p.applyTransform([
            1,
            0,
            0,
            1,
            this.p.x || 0,
            this.p.y || 0
          ]);
          p.applyTransform([
            Math.cos(a),
            Math.sin(a),
            -Math.sin(a),
            Math.cos(a),
            0,
            0
          ]);
          p.applyTransform([
            1,
            0,
            0,
            1,
            -this.p.x || 0,
            -this.p.y || 0
          ]);
        };
      };
      this.Type.scale = function (s) {
        this.p = svg.CreatePoint(s);
        this.apply = function (ctx) {
          ctx.scale(this.p.x || 1, this.p.y || this.p.x || 1);
        };
        this.unapply = function (ctx) {
          ctx.scale(1 / this.p.x || 1, 1 / this.p.y || this.p.x || 1);
        };
        this.applyToPoint = function (p) {
          p.applyTransform([
            this.p.x || 0,
            0,
            0,
            this.p.y || 0,
            0,
            0
          ]);
        };
      };
      this.Type.matrix = function (s) {
        this.m = svg.ToNumberArray(s);
        this.apply = function (ctx) {
          ctx.transform(this.m[0], this.m[1], this.m[2], this.m[3], this.m[4], this.m[5]);
        };
        this.unapply = function (ctx) {
          var a = this.m[0];
          var b = this.m[2];
          var c = this.m[4];
          var d = this.m[1];
          var e = this.m[3];
          var f = this.m[5];
          var g = 0;
          var h = 0;
          var i = 1;
          var det = 1 / (a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g));
          ctx.transform(det * (e * i - f * h), det * (f * g - d * i), det * (c * h - b * i), det * (a * i - c * g), det * (b * f - c * e), det * (c * d - a * f));
        };
        this.applyToPoint = function (p) {
          p.applyTransform(this.m);
        };
      };
      this.Type.SkewBase = function (s) {
        this.base = that.Type.matrix;
        this.base(s);
        this.angle = new svg.Property('angle', s);
      };
      this.Type.SkewBase.prototype = new this.Type.matrix();
      this.Type.skewX = function (s) {
        this.base = that.Type.SkewBase;
        this.base(s);
        this.m = [
          1,
          0,
          Math.tan(this.angle.toRadians()),
          1,
          0,
          0
        ];
      };
      this.Type.skewX.prototype = new this.Type.SkewBase();
      this.Type.skewY = function (s) {
        this.base = that.Type.SkewBase;
        this.base(s);
        this.m = [
          1,
          Math.tan(this.angle.toRadians()),
          0,
          1,
          0,
          0
        ];
      };
      this.Type.skewY.prototype = new this.Type.SkewBase();
      this.transforms = [];
      this.apply = function (ctx) {
        for (var i = 0; i < this.transforms.length; i++) {
          this.transforms[i].apply(ctx);
        }
      };
      this.unapply = function (ctx) {
        for (var i = this.transforms.length - 1; i >= 0; i--) {
          this.transforms[i].unapply(ctx);
        }
      };
      this.applyToPoint = function (p) {
        for (var i = 0; i < this.transforms.length; i++) {
          this.transforms[i].applyToPoint(p);
        }
      };
      var data = svg.trim(svg.compressSpaces(v)).replace(/\)([a-zA-Z])/g, ') $1').replace(/\)(\s?,\s?)/g, ') ').split(/\s(?=[a-z])/);
      for (var i = 0; i < data.length; i++) {
        var type = svg.trim(data[i].split('(')[0]);
        var s = data[i].split('(')[1].replace(')', '');
        var transform = new this.Type[type](s);
        transform.type = type;
        this.transforms.push(transform);
      }
    };
    // aspect ratio
    svg.AspectRatio = function (ctx, aspectRatio, width, desiredWidth, height, desiredHeight, minX, minY, refX, refY) {
      // aspect ratio - http://www.w3.org/TR/SVG/coords.html#PreserveAspectRatioAttribute
      aspectRatio = svg.compressSpaces(aspectRatio);
      aspectRatio = aspectRatio.replace(/^defer\s/, '');
      // ignore defer
      var align = aspectRatio.split(' ')[0] || 'xMidYMid';
      var meetOrSlice = aspectRatio.split(' ')[1] || 'meet';
      // calculate scale
      var scaleX = width / desiredWidth;
      var scaleY = height / desiredHeight;
      var scaleMin = Math.min(scaleX, scaleY);
      var scaleMax = Math.max(scaleX, scaleY);
      if (meetOrSlice == 'meet') {
        desiredWidth *= scaleMin;
        desiredHeight *= scaleMin;
      }
      if (meetOrSlice == 'slice') {
        desiredWidth *= scaleMax;
        desiredHeight *= scaleMax;
      }
      refX = new svg.Property('refX', refX);
      refY = new svg.Property('refY', refY);
      if (refX.hasValue() && refY.hasValue()) {
        ctx.translate(-scaleMin * refX.toPixels('x'), -scaleMin * refY.toPixels('y'));
      } else {
        // align
        if (align.match(/^xMid/) && (meetOrSlice == 'meet' && scaleMin == scaleY || meetOrSlice == 'slice' && scaleMax == scaleY))
          ctx.translate(width / 2 - desiredWidth / 2, 0);
        if (align.match(/YMid$/) && (meetOrSlice == 'meet' && scaleMin == scaleX || meetOrSlice == 'slice' && scaleMax == scaleX))
          ctx.translate(0, height / 2 - desiredHeight / 2);
        if (align.match(/^xMax/) && (meetOrSlice == 'meet' && scaleMin == scaleY || meetOrSlice == 'slice' && scaleMax == scaleY))
          ctx.translate(width - desiredWidth, 0);
        if (align.match(/YMax$/) && (meetOrSlice == 'meet' && scaleMin == scaleX || meetOrSlice == 'slice' && scaleMax == scaleX))
          ctx.translate(0, height - desiredHeight);
      }
      // scale
      if (align == 'none')
        ctx.scale(scaleX, scaleY);
      else if (meetOrSlice == 'meet')
        ctx.scale(scaleMin, scaleMin);
      else if (meetOrSlice == 'slice')
        ctx.scale(scaleMax, scaleMax);
      // translate
      ctx.translate(minX == null ? 0 : -minX, minY == null ? 0 : -minY);
    };
    // elements
    svg.Element = {};
    svg.EmptyProperty = new svg.Property('EMPTY', '');
    svg.Element.ElementBase = function (node) {
      this.attributes = {};
      this.styles = {};
      this.stylesSpecificity = {};
      this.children = [];
      // get or create attribute
      this.attribute = function (name, createIfNotExists) {
        var a = this.attributes[name];
        if (a != null)
          return a;
        if (createIfNotExists == true) {
          a = new svg.Property(name, '');
          this.attributes[name] = a;
        }
        return a || svg.EmptyProperty;
      };
      this.getHrefAttribute = function () {
        for (var a in this.attributes) {
          if (a == 'href' || a.match(/:href$/)) {
            return this.attributes[a];
          }
        }
        return svg.EmptyProperty;
      };
      // get or create style, crawls up node tree
      this.style = function (name, createIfNotExists, skipAncestors) {
        var s = this.styles[name];
        if (s != null)
          return s;
        var a = this.attribute(name);
        if (a != null && a.hasValue()) {
          this.styles[name] = a;
          // move up to me to cache
          return a;
        }
        if (skipAncestors != true) {
          var p = this.parent;
          if (p != null) {
            var ps = p.style(name);
            if (ps != null && ps.hasValue()) {
              return ps;
            }
          }
        }
        if (createIfNotExists == true) {
          s = new svg.Property(name, '');
          this.styles[name] = s;
        }
        return s || svg.EmptyProperty;
      };
      // base render
      this.render = function (ctx) {
        // don't render display=none
        if (this.style('display').value == 'none')
          return;
        // don't render visibility=hidden
        if (this.style('visibility').value == 'hidden')
          return;
        ctx.save();
        if (this.style('mask').hasValue()) {
          // mask
          var mask = this.style('mask').getDefinition();
          if (mask != null)
            mask.apply(ctx, this);
        } else if (this.style('filter').hasValue()) {
          // filter
          var filter = this.style('filter').getDefinition();
          if (filter != null)
            filter.apply(ctx, this);
        } else {
          this.setContext(ctx);
          this.renderChildren(ctx);
          this.clearContext(ctx);
        }
        ctx.restore();
      };
      // base set context
      this.setContext = function (ctx) {
      };
      // base clear context
      this.clearContext = function (ctx) {
      };
      // base render children
      this.renderChildren = function (ctx) {
        for (var i = 0; i < this.children.length; i++) {
          this.children[i].render(ctx);
        }
      };
      this.addChild = function (childNode, create) {
        var child = childNode;
        if (create)
          child = svg.CreateElement(childNode);
        child.parent = this;
        if (child.type != 'title') {
          this.children.push(child);
        }
      };
      this.addStylesFromStyleDefinition = function () {
        // add styles
        for (var selector in svg.Styles) {
          if (selector[0] != '@' && matchesSelector(node, selector)) {
            var styles = svg.Styles[selector];
            var specificity = svg.StylesSpecificity[selector];
            if (styles != null) {
              for (var name in styles) {
                var existingSpecificity = this.stylesSpecificity[name];
                if (typeof existingSpecificity == 'undefined') {
                  existingSpecificity = '000';
                }
                if (specificity > existingSpecificity) {
                  this.styles[name] = styles[name];
                  this.stylesSpecificity[name] = specificity;
                }
              }
            }
          }
        }
      };
      if (node != null && node.nodeType == 1) {
        //ELEMENT_NODE
        // add attributes
        for (var i = 0; i < node.attributes.length; i++) {
          var attribute = node.attributes[i];
          this.attributes[attribute.nodeName] = new svg.Property(attribute.nodeName, attribute.value);
        }
        this.addStylesFromStyleDefinition();
        // add inline styles
        if (this.attribute('style').hasValue()) {
          var styles = this.attribute('style').value.split(';');
          for (var i = 0; i < styles.length; i++) {
            if (svg.trim(styles[i]) != '') {
              var style = styles[i].split(':');
              var name = svg.trim(style[0]);
              var value = svg.trim(style[1]);
              this.styles[name] = new svg.Property(name, value);
            }
          }
        }
        // add id
        if (this.attribute('id').hasValue()) {
          if (svg.Definitions[this.attribute('id').value] == null) {
            svg.Definitions[this.attribute('id').value] = this;
          }
        }
        // add children
        for (var i = 0; i < node.childNodes.length; i++) {
          var childNode = node.childNodes[i];
          if (childNode.nodeType == 1)
            this.addChild(childNode, true);
          //ELEMENT_NODE
          if (this.captureTextNodes && (childNode.nodeType == 3 || childNode.nodeType == 4)) {
            var text = childNode.value || childNode.text || childNode.textContent || '';
            if (svg.compressSpaces(text) != '') {
              this.addChild(new svg.Element.tspan(childNode), false);  // TEXT_NODE
            }
          }
        }
      }
    };
    svg.Element.RenderedElementBase = function (node) {
      this.base = svg.Element.ElementBase;
      this.base(node);
      this.setContext = function (ctx) {

        ctx.fillStyle = svg.opts.col || 'red';

        ctx.strokeStyle = svg.opts.col || 'blue';

        if (this.style('stroke-width').hasValue()) {
          var newLineWidth = this.style('stroke-width').toPixels();
          ctx.lineWidth = newLineWidth == 0 ? 0.001 : newLineWidth;  // browsers don't respect 0
        }
        if (this.style('stroke-linecap').hasValue())
          ctx.lineCap = this.style('stroke-linecap').value;
        if (this.style('stroke-linejoin').hasValue())
          ctx.lineJoin = this.style('stroke-linejoin').value;
        if (this.style('stroke-miterlimit').hasValue())
          ctx.miterLimit = this.style('stroke-miterlimit').value;
        if (this.style('stroke-dasharray').hasValue() && this.style('stroke-dasharray').value != 'none') {
          var gaps = svg.ToNumberArray(this.style('stroke-dasharray').value);
          if (typeof ctx.setLineDash != 'undefined') {
            ctx.setLineDash(gaps);
          } else if (typeof ctx.webkitLineDash != 'undefined') {
            ctx.webkitLineDash = gaps;
          } else if (typeof ctx.mozDash != 'undefined' && !(gaps.length == 1 && gaps[0] == 0)) {
            ctx.mozDash = gaps;
          }
          var offset = this.style('stroke-dashoffset').numValueOrDefault(1);
          if (typeof ctx.lineDashOffset != 'undefined') {
            ctx.lineDashOffset = offset;
          } else if (typeof ctx.webkitLineDashOffset != 'undefined') {
            ctx.webkitLineDashOffset = offset;
          } else if (typeof ctx.mozDashOffset != 'undefined') {
            ctx.mozDashOffset = offset;
          }
        }
        // // font
        // if (typeof ctx.font != 'undefined') {
        //   ctx.font = svg.Font.CreateFont(this.style('font-style').value, this.style('font-variant').value, this.style('font-weight').value, this.style('font-size').hasValue() ? this.style('font-size').toPixels() + 'px' : '', this.style('font-family').value).toString();
        // }
        // transform
        if (this.style('transform', false, true).hasValue()) {
          var transform = new svg.Transform(this.style('transform', false, true).value);
          transform.apply(ctx);
        }
        // clip
        if (this.style('clip-path', false, true).hasValue()) {
          var clip = this.style('clip-path', false, true).getDefinition();
          if (clip != null)
            clip.apply(ctx);
        }
        // opacity
        // if (this.style('opacity').hasValue()) {
        //   ctx.globalAlpha = this.style('opacity').numValue();
        // }
      };
    };
    svg.Element.RenderedElementBase.prototype = new svg.Element.ElementBase();
    svg.Element.PathElementBase = function (node) {
      this.base = svg.Element.RenderedElementBase;
      this.base(node);
      this.path = function (ctx) {
        if (ctx != null)
          ctx.beginPath();
        return new svg.BoundingBox();
      };
      this.renderChildren = function (ctx) {
        this.path(ctx);
        // svg.Mouse.checkPath(this, ctx);
        if (ctx.fillStyle != '') {
          if (this.style('fill-rule').valueOrDefault('inherit') != 'inherit') {
            ctx.fill(this.style('fill-rule').value);
          } else {
            ctx.fill();
          }
        }
        if (ctx.strokeStyle != '')
          ctx.stroke();
        // var markers = this.getMarkers();
        // if (markers != null) {
        //   if (this.style('marker-start').isUrlDefinition()) {
        //     var marker = this.style('marker-start').getDefinition();
        //     marker.render(ctx, markers[0][0], markers[0][1]);
        //   }
        //   if (this.style('marker-mid').isUrlDefinition()) {
        //     var marker = this.style('marker-mid').getDefinition();
        //     for (var i = 1; i < markers.length - 1; i++) {
        //       marker.render(ctx, markers[i][0], markers[i][1]);
        //     }
        //   }
        //   if (this.style('marker-end').isUrlDefinition()) {
        //     var marker = this.style('marker-end').getDefinition();
        //     marker.render(ctx, markers[markers.length - 1][0], markers[markers.length - 1][1]);
        //   }
        // }
      };
      this.getBoundingBox = function () {
        return this.path();
      };
      // this.getMarkers = function () {
      //   return null;
      // };
    };
    svg.Element.PathElementBase.prototype = new svg.Element.RenderedElementBase();
    // svg element
    svg.Element.svg = function (node) {
      this.base = svg.Element.RenderedElementBase;
      this.base(node);
      this.baseClearContext = this.clearContext;
      this.clearContext = function (ctx) {
        this.baseClearContext(ctx);
        svg.ViewPort.RemoveCurrent();
      };
      this.baseSetContext = this.setContext;
      this.setContext = function (ctx) {
        // initial values and defaults
        ctx.strokeStyle = 'rgba(0,0,0,0)';
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.miterLimit = 4;
        if (typeof ctx.font != 'undefined' && typeof window.getComputedStyle != 'undefined') {
          ctx.font = window.getComputedStyle(ctx.canvas).getPropertyValue('font');
        }
        this.baseSetContext(ctx);
        // create new view port
        if (!this.attribute('x').hasValue())
          this.attribute('x', true).value = 0;
        if (!this.attribute('y').hasValue())
          this.attribute('y', true).value = 0;
        ctx.translate(this.attribute('x').toPixels('x'), this.attribute('y').toPixels('y'));
        var width = svg.ViewPort.width();
        var height = svg.ViewPort.height();
        if (!this.attribute('width').hasValue())
          this.attribute('width', true).value = '100%';
        if (!this.attribute('height').hasValue())
          this.attribute('height', true).value = '100%';
        if (typeof this.root == 'undefined') {
          width = this.attribute('width').toPixels('x');
          height = this.attribute('height').toPixels('y');
          var x = 0;
          var y = 0;
          if (this.attribute('refX').hasValue() && this.attribute('refY').hasValue()) {
            x = -this.attribute('refX').toPixels('x');
            y = -this.attribute('refY').toPixels('y');
          }
          if (this.attribute('overflow').valueOrDefault('hidden') != 'visible') {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(width, y);
            ctx.lineTo(width, height);
            ctx.lineTo(x, height);
            ctx.closePath();
            ctx.clip();
          }
        }
        svg.ViewPort.SetCurrent(width, height);
        // viewbox
        if (this.attribute('viewBox').hasValue()) {
          var viewBox = svg.ToNumberArray(this.attribute('viewBox').value);
          var minX = viewBox[0];
          var minY = viewBox[1];
          width = viewBox[2];
          height = viewBox[3];
          svg.AspectRatio(ctx, this.attribute('preserveAspectRatio').value, svg.ViewPort.width(), width, svg.ViewPort.height(), height, minX, minY, this.attribute('refX').value, this.attribute('refY').value);
          svg.ViewPort.RemoveCurrent();
          svg.ViewPort.SetCurrent(viewBox[2], viewBox[3]);
        }
      };
    };
    svg.Element.svg.prototype = new svg.Element.RenderedElementBase();
    // rect element
    svg.Element.rect = function (node) {
      this.base = svg.Element.PathElementBase;
      this.base(node);
      this.path = function (ctx) {
        var x = this.attribute('x').toPixels('x');
        var y = this.attribute('y').toPixels('y');
        var width = this.attribute('width').toPixels('x');
        var height = this.attribute('height').toPixels('y');
        var rx = this.attribute('rx').toPixels('x');
        var ry = this.attribute('ry').toPixels('y');
        if (this.attribute('rx').hasValue() && !this.attribute('ry').hasValue())
          ry = rx;
        if (this.attribute('ry').hasValue() && !this.attribute('rx').hasValue())
          rx = ry;
        rx = Math.min(rx, width / 2);
        ry = Math.min(ry, height / 2);
        if (ctx != null) {
          ctx.beginPath();
          ctx.moveTo(x + rx, y);
          ctx.lineTo(x + width - rx, y);
          ctx.quadraticCurveTo(x + width, y, x + width, y + ry);
          ctx.lineTo(x + width, y + height - ry);
          ctx.quadraticCurveTo(x + width, y + height, x + width - rx, y + height);
          ctx.lineTo(x + rx, y + height);
          ctx.quadraticCurveTo(x, y + height, x, y + height - ry);
          ctx.lineTo(x, y + ry);
          ctx.quadraticCurveTo(x, y, x + rx, y);
          ctx.closePath();
        }
        return new svg.BoundingBox(x, y, x + width, y + height);
      };
    };
    svg.Element.rect.prototype = new svg.Element.PathElementBase();
    // circle element
    svg.Element.circle = function (node) {
      this.base = svg.Element.PathElementBase;
      this.base(node);
      this.path = function (ctx) {
        var cx = this.attribute('cx').toPixels('x');
        var cy = this.attribute('cy').toPixels('y');
        var r = this.attribute('r').toPixels();
        if (ctx != null) {
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
          ctx.closePath();
        }
        return new svg.BoundingBox(cx - r, cy - r, cx + r, cy + r);
      };
    };
    svg.Element.circle.prototype = new svg.Element.PathElementBase();
    // ellipse element
    svg.Element.ellipse = function (node) {
      this.base = svg.Element.PathElementBase;
      this.base(node);
      this.path = function (ctx) {
        var KAPPA = 4 * ((Math.sqrt(2) - 1) / 3);
        var rx = this.attribute('rx').toPixels('x');
        var ry = this.attribute('ry').toPixels('y');
        var cx = this.attribute('cx').toPixels('x');
        var cy = this.attribute('cy').toPixels('y');
        if (ctx != null) {
          ctx.beginPath();
          ctx.moveTo(cx, cy - ry);
          ctx.bezierCurveTo(cx + KAPPA * rx, cy - ry, cx + rx, cy - KAPPA * ry, cx + rx, cy);
          ctx.bezierCurveTo(cx + rx, cy + KAPPA * ry, cx + KAPPA * rx, cy + ry, cx, cy + ry);
          ctx.bezierCurveTo(cx - KAPPA * rx, cy + ry, cx - rx, cy + KAPPA * ry, cx - rx, cy);
          ctx.bezierCurveTo(cx - rx, cy - KAPPA * ry, cx - KAPPA * rx, cy - ry, cx, cy - ry);
          ctx.closePath();
        }
        return new svg.BoundingBox(cx - rx, cy - ry, cx + rx, cy + ry);
      };
    };
    svg.Element.ellipse.prototype = new svg.Element.PathElementBase();
    // line element
    svg.Element.line = function (node) {
      this.base = svg.Element.PathElementBase;
      this.base(node);
      this.getPoints = function () {
        return [
          new svg.Point(this.attribute('x1').toPixels('x'), this.attribute('y1').toPixels('y')),
          new svg.Point(this.attribute('x2').toPixels('x'), this.attribute('y2').toPixels('y'))
        ];
      };
      this.path = function (ctx) {
        var points = this.getPoints();
        if (ctx != null) {
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          ctx.lineTo(points[1].x, points[1].y);
        }
        return new svg.BoundingBox(points[0].x, points[0].y, points[1].x, points[1].y);
      };
      // this.getMarkers = function () {
      //   var points = this.getPoints();
      //   var a = points[0].angleTo(points[1]);
      //   return [
      //     [
      //       points[0],
      //       a
      //     ],
      //     [
      //       points[1],
      //       a
      //     ]
      //   ];
      // };
    };
    svg.Element.line.prototype = new svg.Element.PathElementBase();
    // polyline element
    svg.Element.polyline = function (node) {
      this.base = svg.Element.PathElementBase;
      this.base(node);
      this.points = svg.CreatePath(this.attribute('points').value);
      this.path = function (ctx) {
        var bb = new svg.BoundingBox(this.points[0].x, this.points[0].y);
        if (ctx != null) {
          ctx.beginPath();
          ctx.moveTo(this.points[0].x, this.points[0].y);
        }
        for (var i = 1; i < this.points.length; i++) {
          bb.addPoint(this.points[i].x, this.points[i].y);
          if (ctx != null)
            ctx.lineTo(this.points[i].x, this.points[i].y);
        }
        return bb;
      };
      // this.getMarkers = function () {
      //   var markers = [];
      //   for (var i = 0; i < this.points.length - 1; i++) {
      //     markers.push([
      //       this.points[i],
      //       this.points[i].angleTo(this.points[i + 1])
      //     ]);
      //   }
      //   markers.push([
      //     this.points[this.points.length - 1],
      //     markers[markers.length - 1][1]
      //   ]);
      //   return markers;
      // };
    };
    svg.Element.polyline.prototype = new svg.Element.PathElementBase();
    // polygon element
    svg.Element.polygon = function (node) {
      this.base = svg.Element.polyline;
      this.base(node);
      this.basePath = this.path;
      this.path = function (ctx) {
        var bb = this.basePath(ctx);
        if (ctx != null) {
          ctx.lineTo(this.points[0].x, this.points[0].y);
          ctx.closePath();
        }
        return bb;
      };
    };
    svg.Element.polygon.prototype = new svg.Element.polyline();
    // path element
    svg.Element.path = function (node) {
      this.base = svg.Element.PathElementBase;
      this.base(node);
      var d = this.attribute('d').value;
      // TODO: convert to real lexer based on http://www.w3.org/TR/SVG11/paths.html#PathDataBNF
      d = d.replace(/,/gm, ' ');
      // get rid of all commas
      // As the end of a match can also be the start of the next match, we need to run this replace twice.
      for (var i = 0; i < 2; i++)
        d = d.replace(/([MmZzLlHhVvCcSsQqTtAa])([^\s])/gm, '$1 $2');
      // suffix commands with spaces
      d = d.replace(/([^\s])([MmZzLlHhVvCcSsQqTtAa])/gm, '$1 $2');
      // prefix commands with spaces
      d = d.replace(/([0-9])([+\-])/gm, '$1 $2');
      // separate digits on +- signs
      // Again, we need to run this twice to find all occurances
      for (var i = 0; i < 2; i++)
        d = d.replace(/(\.[0-9]*)(\.)/gm, '$1 $2');
      // separate digits when they start with a comma
      d = d.replace(/([Aa](\s+[0-9]+){3})\s+([01])\s*([01])/gm, '$1 $3 $4 ');
      // shorthand elliptical arc path syntax
      d = svg.compressSpaces(d);
      // compress multiple spaces
      d = svg.trim(d);
      this.PathParser = new function (d) {
        this.tokens = d.split(' ');
        this.reset = function () {
          this.i = -1;
          this.command = '';
          this.previousCommand = '';
          this.start = new svg.Point(0, 0);
          this.control = new svg.Point(0, 0);
          this.current = new svg.Point(0, 0);
          this.points = [];
          this.angles = [];
        };
        this.isEnd = function () {
          return this.i >= this.tokens.length - 1;
        };
        this.isCommandOrEnd = function () {
          if (this.isEnd())
            return true;
          return this.tokens[this.i + 1].match(/^[A-Za-z]$/) != null;
        };
        this.isRelativeCommand = function () {
          switch (this.command) {
          case 'm':
          case 'l':
          case 'h':
          case 'v':
          case 'c':
          case 's':
          case 'q':
          case 't':
          case 'a':
          case 'z':
            return true;
            break;
          }
          return false;
        };
        this.getToken = function () {
          this.i++;
          return this.tokens[this.i];
        };
        this.getScalar = function () {
          return parseFloat(this.getToken());
        };
        this.nextCommand = function () {
          this.previousCommand = this.command;
          this.command = this.getToken();
        };
        this.getPoint = function () {
          var p = new svg.Point(this.getScalar(), this.getScalar());
          return this.makeAbsolute(p);
        };
        this.getAsControlPoint = function () {
          var p = this.getPoint();
          this.control = p;
          return p;
        };
        this.getAsCurrentPoint = function () {
          var p = this.getPoint();
          this.current = p;
          return p;
        };
        this.getReflectedControlPoint = function () {
          if (this.previousCommand.toLowerCase() != 'c' && this.previousCommand.toLowerCase() != 's' && this.previousCommand.toLowerCase() != 'q' && this.previousCommand.toLowerCase() != 't') {
            return this.current;
          }
          // reflect point
          var p = new svg.Point(2 * this.current.x - this.control.x, 2 * this.current.y - this.control.y);
          return p;
        };
        this.makeAbsolute = function (p) {
          if (this.isRelativeCommand()) {
            p.x += this.current.x;
            p.y += this.current.y;
          }
          return p;
        };
        this.addMarker = function (p, from, priorTo) {
          // if the last angle isn't filled in because we didn't have this point yet ...
          if (priorTo != null && this.angles.length > 0 && this.angles[this.angles.length - 1] == null) {
            this.angles[this.angles.length - 1] = this.points[this.points.length - 1].angleTo(priorTo);
          }
          this.addMarkerAngle(p, from == null ? null : from.angleTo(p));
        };
        this.addMarkerAngle = function (p, a) {
          this.points.push(p);
          this.angles.push(a);
        };
        this.getMarkerPoints = function () {
          return this.points;
        };
        this.getMarkerAngles = function () {
          for (var i = 0; i < this.angles.length; i++) {
            if (this.angles[i] == null) {
              for (var j = i + 1; j < this.angles.length; j++) {
                if (this.angles[j] != null) {
                  this.angles[i] = this.angles[j];
                  break;
                }
              }
            }
          }
          return this.angles;
        };
      }(d);
      this.path = function (ctx) {
        var pp = this.PathParser;
        pp.reset();
        var bb = new svg.BoundingBox();
        if (ctx != null)
          ctx.beginPath();
        while (!pp.isEnd()) {
          pp.nextCommand();
          switch (pp.command) {
          case 'M':
          case 'm':
            var p = pp.getAsCurrentPoint();
            pp.addMarker(p);
            bb.addPoint(p.x, p.y);
            if (ctx != null)
              ctx.moveTo(p.x, p.y);
            pp.start = pp.current;
            while (!pp.isCommandOrEnd()) {
              var p = pp.getAsCurrentPoint();
              pp.addMarker(p, pp.start);
              bb.addPoint(p.x, p.y);
              if (ctx != null)
                ctx.lineTo(p.x, p.y);
            }
            break;
          case 'L':
          case 'l':
            while (!pp.isCommandOrEnd()) {
              var c = pp.current;
              var p = pp.getAsCurrentPoint();
              pp.addMarker(p, c);
              bb.addPoint(p.x, p.y);
              if (ctx != null)
                ctx.lineTo(p.x, p.y);
            }
            break;
          case 'H':
          case 'h':
            while (!pp.isCommandOrEnd()) {
              var newP = new svg.Point((pp.isRelativeCommand() ? pp.current.x : 0) + pp.getScalar(), pp.current.y);
              pp.addMarker(newP, pp.current);
              pp.current = newP;
              bb.addPoint(pp.current.x, pp.current.y);
              if (ctx != null)
                ctx.lineTo(pp.current.x, pp.current.y);
            }
            break;
          case 'V':
          case 'v':
            while (!pp.isCommandOrEnd()) {
              var newP = new svg.Point(pp.current.x, (pp.isRelativeCommand() ? pp.current.y : 0) + pp.getScalar());
              pp.addMarker(newP, pp.current);
              pp.current = newP;
              bb.addPoint(pp.current.x, pp.current.y);
              if (ctx != null)
                ctx.lineTo(pp.current.x, pp.current.y);
            }
            break;
          case 'C':
          case 'c':
            while (!pp.isCommandOrEnd()) {
              var curr = pp.current;
              var p1 = pp.getPoint();
              var cntrl = pp.getAsControlPoint();
              var cp = pp.getAsCurrentPoint();
              pp.addMarker(cp, cntrl, p1);
              bb.addBezierCurve(curr.x, curr.y, p1.x, p1.y, cntrl.x, cntrl.y, cp.x, cp.y);
              if (ctx != null)
                ctx.bezierCurveTo(p1.x, p1.y, cntrl.x, cntrl.y, cp.x, cp.y);
            }
            break;
          case 'S':
          case 's':
            while (!pp.isCommandOrEnd()) {
              var curr = pp.current;
              var p1 = pp.getReflectedControlPoint();
              var cntrl = pp.getAsControlPoint();
              var cp = pp.getAsCurrentPoint();
              pp.addMarker(cp, cntrl, p1);
              bb.addBezierCurve(curr.x, curr.y, p1.x, p1.y, cntrl.x, cntrl.y, cp.x, cp.y);
              if (ctx != null)
                ctx.bezierCurveTo(p1.x, p1.y, cntrl.x, cntrl.y, cp.x, cp.y);
            }
            break;
          case 'Q':
          case 'q':
            while (!pp.isCommandOrEnd()) {
              var curr = pp.current;
              var cntrl = pp.getAsControlPoint();
              var cp = pp.getAsCurrentPoint();
              pp.addMarker(cp, cntrl, cntrl);
              bb.addQuadraticCurve(curr.x, curr.y, cntrl.x, cntrl.y, cp.x, cp.y);
              if (ctx != null)
                ctx.quadraticCurveTo(cntrl.x, cntrl.y, cp.x, cp.y);
            }
            break;
          case 'T':
          case 't':
            while (!pp.isCommandOrEnd()) {
              var curr = pp.current;
              var cntrl = pp.getReflectedControlPoint();
              pp.control = cntrl;
              var cp = pp.getAsCurrentPoint();
              pp.addMarker(cp, cntrl, cntrl);
              bb.addQuadraticCurve(curr.x, curr.y, cntrl.x, cntrl.y, cp.x, cp.y);
              if (ctx != null)
                ctx.quadraticCurveTo(cntrl.x, cntrl.y, cp.x, cp.y);
            }
            break;
          case 'A':
          case 'a':
            while (!pp.isCommandOrEnd()) {
              var curr = pp.current;
              var rx = pp.getScalar();
              var ry = pp.getScalar();
              var xAxisRotation = pp.getScalar() * (Math.PI / 180);
              var largeArcFlag = pp.getScalar();
              var sweepFlag = pp.getScalar();
              var cp = pp.getAsCurrentPoint();
              // Conversion from endpoint to center parameterization
              // http://www.w3.org/TR/SVG11/implnote.html#ArcImplementationNotes
              // x1', y1'
              var currp = new svg.Point(Math.cos(xAxisRotation) * (curr.x - cp.x) / 2 + Math.sin(xAxisRotation) * (curr.y - cp.y) / 2, -Math.sin(xAxisRotation) * (curr.x - cp.x) / 2 + Math.cos(xAxisRotation) * (curr.y - cp.y) / 2);
              // adjust radii
              var l = Math.pow(currp.x, 2) / Math.pow(rx, 2) + Math.pow(currp.y, 2) / Math.pow(ry, 2);
              if (l > 1) {
                rx *= Math.sqrt(l);
                ry *= Math.sqrt(l);
              }
              // cx', cy'
              var s = (largeArcFlag == sweepFlag ? -1 : 1) * Math.sqrt((Math.pow(rx, 2) * Math.pow(ry, 2) - Math.pow(rx, 2) * Math.pow(currp.y, 2) - Math.pow(ry, 2) * Math.pow(currp.x, 2)) / (Math.pow(rx, 2) * Math.pow(currp.y, 2) + Math.pow(ry, 2) * Math.pow(currp.x, 2)));
              if (isNaN(s))
                s = 0;
              var cpp = new svg.Point(s * rx * currp.y / ry, s * -ry * currp.x / rx);
              // cx, cy
              var centp = new svg.Point((curr.x + cp.x) / 2 + Math.cos(xAxisRotation) * cpp.x - Math.sin(xAxisRotation) * cpp.y, (curr.y + cp.y) / 2 + Math.sin(xAxisRotation) * cpp.x + Math.cos(xAxisRotation) * cpp.y);
              // vector magnitude
              var m = function (v) {
                return Math.sqrt(Math.pow(v[0], 2) + Math.pow(v[1], 2));
              };
              // ratio between two vectors
              var r = function (u, v) {
                return (u[0] * v[0] + u[1] * v[1]) / (m(u) * m(v));
              };
              // angle between two vectors
              var a = function (u, v) {
                return (u[0] * v[1] < u[1] * v[0] ? -1 : 1) * Math.acos(r(u, v));
              };
              // initial angle
              var a1 = a([
                1,
                0
              ], [
                (currp.x - cpp.x) / rx,
                (currp.y - cpp.y) / ry
              ]);
              // angle delta
              var u = [
                (currp.x - cpp.x) / rx,
                (currp.y - cpp.y) / ry
              ];
              var v = [
                (-currp.x - cpp.x) / rx,
                (-currp.y - cpp.y) / ry
              ];
              var ad = a(u, v);
              if (r(u, v) <= -1)
                ad = Math.PI;
              if (r(u, v) >= 1)
                ad = 0;
              // for markers
              var dir = 1 - sweepFlag ? 1 : -1;
              var ah = a1 + dir * (ad / 2);
              var halfWay = new svg.Point(centp.x + rx * Math.cos(ah), centp.y + ry * Math.sin(ah));
              pp.addMarkerAngle(halfWay, ah - dir * Math.PI / 2);
              pp.addMarkerAngle(cp, ah - dir * Math.PI);
              bb.addPoint(cp.x, cp.y);
              // TODO: this is too naive, make it better
              if (ctx != null) {
                var r = rx > ry ? rx : ry;
                var sx = rx > ry ? 1 : rx / ry;
                var sy = rx > ry ? ry / rx : 1;
                ctx.translate(centp.x, centp.y);
                ctx.rotate(xAxisRotation);
                ctx.scale(sx, sy);
                ctx.arc(0, 0, r, a1, a1 + ad, 1 - sweepFlag);
                ctx.scale(1 / sx, 1 / sy);
                ctx.rotate(-xAxisRotation);
                ctx.translate(-centp.x, -centp.y);
              }
            }
            break;
          case 'Z':
          case 'z':
            if (ctx != null)
              ctx.closePath();
            pp.current = pp.start;
          }
        }
        return bb;
      };
      // this.getMarkers = function () {
      //   var points = this.PathParser.getMarkerPoints();
      //   var angles = this.PathParser.getMarkerAngles();
      //   var markers = [];
      //   for (var i = 0; i < points.length; i++) {
      //     markers.push([
      //       points[i],
      //       angles[i]
      //     ]);
      //   }
      //   return markers;
      // };
    };
    svg.Element.path.prototype = new svg.Element.PathElementBase();

    // definitions element
    svg.Element.defs = function (node) {
      this.base = svg.Element.ElementBase;
      this.base(node);
      this.render = function (ctx) {
      };
    };
    svg.Element.defs.prototype = new svg.Element.ElementBase();

    // image element
    svg.Element.image = function (node) {
    };
    svg.Element.image.prototype = new svg.Element.RenderedElementBase();
    // group element
    svg.Element.g = function (node) {
      this.base = svg.Element.RenderedElementBase;
      this.base(node);
      this.getBoundingBox = function () {
        var bb = new svg.BoundingBox();
        for (var i = 0; i < this.children.length; i++) {
          bb.addBoundingBox(this.children[i].getBoundingBox());
        }
        return bb;
      };
    };
    svg.Element.g.prototype = new svg.Element.RenderedElementBase();
    // symbol element
    svg.Element.symbol = function (node) {
      this.base = svg.Element.RenderedElementBase;
      this.base(node);
      this.render = function (ctx) {
      };
    };
    svg.Element.symbol.prototype = new svg.Element.RenderedElementBase();

    // use element
    svg.Element.use = function (node) {
      this.base = svg.Element.RenderedElementBase;
      this.base(node);
      this.baseSetContext = this.setContext;
      this.setContext = function (ctx) {
        this.baseSetContext(ctx);
        if (this.attribute('x').hasValue())
          ctx.translate(this.attribute('x').toPixels('x'), 0);
        if (this.attribute('y').hasValue())
          ctx.translate(0, this.attribute('y').toPixels('y'));
      };
      var element = this.getHrefAttribute().getDefinition();
      this.path = function (ctx) {
        if (element != null)
          element.path(ctx);
      };
      this.getBoundingBox = function () {
        if (element != null)
          return element.getBoundingBox();
      };
      this.renderChildren = function (ctx) {
        if (element != null) {
          var tempSvg = element;
          if (element.type == 'symbol') {
            // render me using a temporary svg element in symbol cases (http://www.w3.org/TR/SVG/struct.html#UseElement)
            tempSvg = new svg.Element.svg();
            tempSvg.type = 'svg';
            tempSvg.attributes.viewBox = new svg.Property('viewBox', element.attribute('viewBox').value);
            tempSvg.attributes.preserveAspectRatio = new svg.Property('preserveAspectRatio', element.attribute('preserveAspectRatio').value);
            tempSvg.attributes.overflow = new svg.Property('overflow', element.attribute('overflow').value);
            tempSvg.children = element.children;
          }
          if (tempSvg.type == 'svg') {
            // if symbol or svg, inherit width/height from me
            if (this.attribute('width').hasValue())
              tempSvg.attributes.width = new svg.Property('width', this.attribute('width').value);
            if (this.attribute('height').hasValue())
              tempSvg.attributes.height = new svg.Property('height', this.attribute('height').value);
          }
          var oldParent = tempSvg.parent;
          tempSvg.parent = null;
          tempSvg.render(ctx);
          tempSvg.parent = oldParent;
        }
      };
    };
    svg.Element.use.prototype = new svg.Element.RenderedElementBase();
    // mask element
    svg.Element.mask = function (node) {
      this.base = svg.Element.ElementBase;
      this.base(node);
      this.apply = function (ctx, element) {
        // render as temp svg
        var x = this.attribute('x').toPixels('x');
        var y = this.attribute('y').toPixels('y');
        var width = this.attribute('width').toPixels('x');
        var height = this.attribute('height').toPixels('y');
        if (width == 0 && height == 0) {
          var bb = new svg.BoundingBox();
          for (var i = 0; i < this.children.length; i++) {
            bb.addBoundingBox(this.children[i].getBoundingBox());
          }
          var x = Math.floor(bb.x1);
          var y = Math.floor(bb.y1);
          var width = Math.floor(bb.width());
          var height = Math.floor(bb.height());
        }
        // temporarily remove mask to avoid recursion
        var mask = element.attribute('mask').value;
        element.attribute('mask').value = '';
        var cMask = document.createElement('canvas');
        cMask.width = x + width;
        cMask.height = y + height;
        var maskCtx = cMask.getContext('2d');
        this.renderChildren(maskCtx);
        var c = document.createElement('canvas');
        c.width = x + width;
        c.height = y + height;
        var tempCtx = c.getContext('2d');
        element.render(tempCtx);
        tempCtx.globalCompositeOperation = 'destination-in';
        //
        if (c.width > 0) {
          tempCtx.fillStyle = maskCtx.createPattern(cMask, 'no-repeat');
          tempCtx.fillRect(0, 0, x + width, y + height);
          ctx.fillStyle = tempCtx.createPattern(c, 'no-repeat');
          ctx.fillRect(0, 0, x + width, y + height);
        }
        // reassign mask
        element.attribute('mask').value = mask;
      };
      this.render = function (ctx) {
      };
    };
    svg.Element.mask.prototype = new svg.Element.ElementBase();
    // clip element
    svg.Element.clipPath = function (node) {
      this.base = svg.Element.ElementBase;
      this.base(node);
      this.apply = function (ctx) {
        var oldBeginPath = CanvasRenderingContext2D.prototype.beginPath;
        CanvasRenderingContext2D.prototype.beginPath = function () {
        };
        var oldClosePath = CanvasRenderingContext2D.prototype.closePath;
        CanvasRenderingContext2D.prototype.closePath = function () {
        };
        oldBeginPath.call(ctx);
        for (var i = 0; i < this.children.length; i++) {
          var child = this.children[i];
          if (typeof child.path != 'undefined') {
            var transform = null;
            if (child.style('transform', false, true).hasValue()) {
              transform = new svg.Transform(child.style('transform', false, true).value);
              transform.apply(ctx);
            }
            child.path(ctx);
            CanvasRenderingContext2D.prototype.closePath = oldClosePath;
            if (transform) {
              transform.unapply(ctx);
            }
          }
        }
        oldClosePath.call(ctx);
        ctx.clip();
        CanvasRenderingContext2D.prototype.beginPath = oldBeginPath;
        CanvasRenderingContext2D.prototype.closePath = oldClosePath;
      };
      this.render = function (ctx) {
      };
    };
    svg.Element.clipPath.prototype = new svg.Element.ElementBase();

    svg.Element.MISSING = function (node) {
      svg.log('zilent fail - node not supported (REMOVE)' + node + 'z');  // svg.log('ERROR: Element \'' + node.nodeName + '\' not yet implemented.');
    };
    svg.Element.MISSING.prototype = new svg.Element.ElementBase();
    // element factory
    svg.CreateElement = function (node) {
      var className = node.nodeName.replace(/^[^:]+:/, '');
      // remove namespace
      className = className.replace(/\-/g, '');
      // remove dashes
      var e = null;
      if (typeof svg.Element[className] != 'undefined') {
        e = new svg.Element[className](node);
      } else {
        e = new svg.Element.MISSING(node);
      }
      e.type = node.nodeName;
      return e;
    };

    // load from xml
    svg.loadXml = function (ctx, xml) {

      svg.loadXmlDoc(ctx, svg.parseXml(xml));
    };
    svg.loadXmlDoc = function (ctx, dom) {
      svg.init(ctx);

      var mapXY = function (p) {
        var e = ctx.canvas;
        while (e) {
          p.x -= e.offsetLeft;
          p.y -= e.offsetTop;
          e = e.offsetParent;
        }
        if (window.scrollX)
          p.x += window.scrollX;
        if (window.scrollY)
          p.y += window.scrollY;
        return p;
      };

      var e = svg.CreateElement(dom.documentElement);
      e.root = true;
      e.addStylesFromStyleDefinition();
      // render loop
      var isFirstRender = true;
      var draw = function () {
        svg.ViewPort.Clear();
        if (ctx.canvas.parentNode)
          svg.ViewPort.SetCurrent(ctx.canvas.parentNode.clientWidth, ctx.canvas.parentNode.clientHeight);
        if (svg.opts.ignoreDimensions != true) {
          // set canvas size
          if (e.style('width').hasValue()) {
            ctx.canvas.width = e.style('width').toPixels('x');
            ctx.canvas.style.width = ctx.canvas.width + 'px';
          }
          if (e.style('height').hasValue()) {
            ctx.canvas.height = e.style('height').toPixels('y');
            ctx.canvas.style.height = ctx.canvas.height + 'px';
          }
        }
        var cWidth = ctx.canvas.clientWidth || ctx.canvas.width;
        var cHeight = ctx.canvas.clientHeight || ctx.canvas.height;
        if (svg.opts.ignoreDimensions == true && e.style('width').hasValue() && e.style('height').hasValue()) {
          cWidth = e.style('width').toPixels('x');
          cHeight = e.style('height').toPixels('y');
        }
        svg.ViewPort.SetCurrent(cWidth, cHeight);
        if (svg.opts.offsetX != null)
          e.attribute('x', true).value = svg.opts.offsetX;
        if (svg.opts.offsetY != null)
          e.attribute('y', true).value = svg.opts.offsetY;
        if (svg.opts.scaleWidth != null || svg.opts.scaleHeight != null) {
          var xRatio = null, yRatio = null, viewBox = svg.ToNumberArray(e.attribute('viewBox').value);
          if (svg.opts.scaleWidth != null) {
            if (e.attribute('width').hasValue())
              xRatio = e.attribute('width').toPixels('x') / svg.opts.scaleWidth;
            else if (!isNaN(viewBox[2]))
              xRatio = viewBox[2] / svg.opts.scaleWidth;
          }
          if (svg.opts.scaleHeight != null) {
            if (e.attribute('height').hasValue())
              yRatio = e.attribute('height').toPixels('y') / svg.opts.scaleHeight;
            else if (!isNaN(viewBox[3]))
              yRatio = viewBox[3] / svg.opts.scaleHeight;
          }
          if (xRatio == null) {
            xRatio = yRatio;
          }
          if (yRatio == null) {
            yRatio = xRatio;
          }
          e.attribute('width', true).value = svg.opts.scaleWidth;
          e.attribute('height', true).value = svg.opts.scaleHeight;
          e.style('transform', true, true).value += ' scale(' + 1 / xRatio + ',' + 1 / yRatio + ')';
        }
        // clear and render
        if (svg.opts.ignoreClear != true) {
          ctx.clearRect(0, 0, cWidth, cHeight);
        }
        e.render(ctx);
        if (isFirstRender) {
          isFirstRender = false;
          if (typeof svg.opts.renderCallback == 'function')
            svg.opts.renderCallback(dom);
        }
      };


      draw();
    };
    svg.stop = function () {};

    return svg;
  }

  return canvg;
}));
