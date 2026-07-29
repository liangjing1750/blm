import {
  __commonJS
} from "./chunk-4AJYGB4N.js";

// node_modules/dom-to-image-more/dist/dom-to-image-more.min.js
var require_dom_to_image_more_min = __commonJS({
  "node_modules/dom-to-image-more/dist/dom-to-image-more.min.js"(exports, module) {
    /*! dom-to-image-more v3.10.0 2026-06-12 05:29:50 UTC */
    ((d) => {
      let p = /* @__PURE__ */ (() => {
        let e2 = 0;
        return { escape: function(e3) {
          return e3.replace(/([.*+?^${}()|[\]/\\])/g, "\\$1");
        }, isDataUrl: function(e3) {
          return -1 !== e3.search(/^(data:)/);
        }, canvasToBlob: function(t3) {
          if (t3.toBlob) return new Promise(function(e3) {
            t3.toBlob(e3);
          });
          return ((o3) => new Promise(function(e3) {
            var t4 = b(o3.toDataURL().split(",")[1]), n3 = t4.length, r3 = new Uint8Array(n3);
            for (let e4 = 0; e4 < n3; e4++) r3[e4] = t4.charCodeAt(e4);
            e3(new Blob([r3], { type: "image/png" }));
          }))(t3);
        }, resolveUrl: function(e3, t3) {
          var n3 = document.implementation.createHTMLDocument(), r3 = n3.createElement("base"), o3 = (n3.head.appendChild(r3), n3.createElement("a"));
          return Object.assign(o3.style, h), n3.body.appendChild(o3), r3.href = t3, o3.href = e3, o3.href;
        }, getAndEncode: function(e3, t3) {
          return c2(e3, t3, true).then(s2);
        }, getResourceText: function(e3, t3, n3) {
          return c2(e3, t3, n3).then(u2);
        }, uid: function() {
          return "u" + ("0000" + (Math.random() * Math.pow(36, 4) << 0).toString(36)).slice(-4) + e2++;
        }, asArray: function(e3) {
          return Array.from(e3);
        }, escapeXhtml: function(e3) {
          return e3.replace(/%/g, "%25").replace(/#/g, "%23").replace(/\n/g, "%0A");
        }, makeImage: function(i3) {
          return "data:," !== i3 ? new Promise(function(t3, n3) {
            let r3 = document.createElementNS("http://www.w3.org/2000/svg", "svg"), o3 = new Image();
            v.impl.options.useCredentials && (o3.crossOrigin = "use-credentials"), o3.onload = function() {
              function e3() {
                window && window.requestAnimationFrame ? window.requestAnimationFrame(function() {
                  t3(o3);
                }) : t3(o3);
              }
              r3.remove(), "function" == typeof o3.decode ? o3.decode().then(e3, e3) : e3();
            }, o3.onerror = (e3) => {
              r3.remove();
              var t4 = String(i3).split(",", 1)[0], t4 = new Error("dom-to-image-more: failed to rasterize the generated image (" + t4 + ", " + String(i3).length + " bytes). The source may contain malformed markup, an unsupported element, or a tainted/cross-origin resource.");
              t4.cause = e3, n3(t4);
            }, r3.appendChild(o3), Object.assign(r3.style, h), o3.src = i3, document.body.appendChild(r3);
          }) : Promise.resolve();
        }, width: function(e3) {
          var t3 = m2(e3, "width");
          if (!isNaN(t3)) return t3;
          t3 = f2(e3);
          if (t3) return t3.width;
          var t3 = m2(e3, "border-left-width"), n3 = m2(e3, "border-right-width");
          return e3.scrollWidth + t3 + n3;
        }, height: function(e3) {
          var t3 = m2(e3, "height");
          if (!isNaN(t3)) return t3;
          t3 = f2(e3);
          if (t3) return t3.height;
          var t3 = m2(e3, "border-top-width"), n3 = m2(e3, "border-bottom-width");
          return e3.scrollHeight + t3 + n3;
        }, getWindow: r2, isElement: l2, isElementHostForOpenShadowRoot: function(e3) {
          return l2(e3) && null !== e3.shadowRoot;
        }, isShadowRoot: n2, isInShadowRoot: i2, isHTMLElement: function(e3) {
          return t2(e3, "HTMLElement");
        }, isHTMLCanvasElement: function(e3) {
          return t2(e3, "HTMLCanvasElement");
        }, isHTMLInputElement: function(e3) {
          return t2(e3, "HTMLInputElement");
        }, isHTMLImageElement: function(e3) {
          return t2(e3, "HTMLImageElement");
        }, isHTMLLinkElement: function(e3) {
          return t2(e3, "HTMLLinkElement");
        }, isHTMLScriptElement: function(e3) {
          return t2(e3, "HTMLScriptElement");
        }, isHTMLStyleElement: function(e3) {
          return t2(e3, "HTMLStyleElement");
        }, isHTMLTextAreaElement: function(e3) {
          return t2(e3, "HTMLTextAreaElement");
        }, isShadowSlotElement: function(e3) {
          return i2(e3) && t2(e3, "HTMLSlotElement");
        }, isSVGElement: function(e3) {
          return t2(e3, "SVGElement");
        }, isSVGImageElement: function(e3) {
          return t2(e3, "SVGImageElement");
        }, isSVGSVGElement: function(e3) {
          return t2(e3, "SVGSVGElement");
        }, isSVGRectElement: function(e3) {
          return t2(e3, "SVGRectElement");
        }, isSVGUseElement: function(e3) {
          return t2(e3, "SVGUseElement");
        }, isDimensionMissing: function(e3) {
          return isNaN(e3) || e3 <= 0;
        }, isInstanceOf: t2 };
        function r2(e3) {
          e3 = e3 ? e3.ownerDocument : void 0;
          return (e3 ? e3.defaultView : void 0) || ("undefined" != typeof window ? window : void 0) || (void 0 !== d ? d : void 0) || globalThis;
        }
        function t2(e3, t3) {
          var n3 = r2(e3);
          return o2(e3, n3, t3) || o2(e3, n3 && n3.parent, t3);
        }
        function o2(e3, t3, n3) {
          try {
            var r3 = t3 && t3[n3];
            return "function" == typeof r3 && e3 instanceof r3;
          } catch (e4) {
            return false;
          }
        }
        function n2(e3) {
          return t2(e3, "ShadowRoot");
        }
        function i2(e3) {
          return null != e3 && void 0 !== e3.getRootNode && n2(e3.getRootNode());
        }
        function l2(e3) {
          return t2(e3, "Element");
        }
        function s2(e3) {
          return null == e3 || "" === e3 ? "" : "string" == typeof e3 ? e3 : a2(e3, "readAsDataURL", "");
        }
        function u2(e3) {
          if (null == e3 || "" === e3) return null;
          if ("string" != typeof e3) return a2(e3, "readAsText", null);
          {
            var r3 = (e3 = e3).indexOf(",");
            if (-1 === r3) return "";
            var o3 = e3.slice(0, r3), e3 = e3.slice(r3 + 1);
            if (!/;base64/i.test(o3)) return decodeURIComponent(e3);
            let t3 = b(e3), n3 = "";
            for (let e4 = 0; e4 < t3.length; e4 += 1) n3 += "%" + ("00" + t3.charCodeAt(e4).toString(16)).slice(-2);
            return decodeURIComponent(n3);
          }
        }
        function a2(n3, r3, o3) {
          return new Promise(function(t3) {
            let e3 = new FileReader();
            e3.onloadend = function() {
              t3(e3.result);
            }, e3.onerror = function() {
              t3(o3);
            };
            try {
              e3[r3](n3);
            } catch (e4) {
              t3(o3);
            }
          });
        }
        function c2(a3, c3, e3) {
          let t3 = v.impl.urlCache.find(function(e4) {
            return e4.url === a3;
          });
          if (t3 || (t3 = { url: a3, promise: null }, v.impl.urlCache.push(t3)), null === t3.promise) {
            let s3 = function(e4) {
              var t4 = v.impl.options.requestInterceptor;
              if ("function" == typeof t4) try {
                return t4(a3, { type: c3, status: e4 });
              } catch (e5) {
                S("requestInterceptor threw:", e5);
              }
            }, u3 = function(e4) {
              return null != e4;
            };
            var n3 = s3(void 0);
            if (u3(n3)) return t3.promise = Promise.resolve(n3), t3.promise;
            if (false === e3) return t3.promise = Promise.resolve(null), t3.promise;
            v.impl.options.cacheBust && (a3 += (/\?/.test(a3) ? "&" : "?") + (/* @__PURE__ */ new Date()).getTime()), t3.promise = new Promise(function(n4) {
              let o3 = new XMLHttpRequest();
              function i3(e5) {
                l3(e5, false), n4(null);
              }
              function t4() {
                r3("Status:" + o3.status + " while fetching resource: " + a3);
              }
              function r3(t5) {
                var e5 = s3(o3.status);
                u3(e5) ? Promise.resolve(e5).then(function(e6) {
                  l3(t5, true), n4(e6);
                }, function() {
                  S(t5), i3(t5);
                }) : (e5 = c3 === y.IMAGE || c3 === y.CSS_IMAGE ? v.impl.options.imagePlaceholder : void 0) ? (l3(t5, true), n4(e5)) : (S(t5), i3(t5));
              }
              function l3(e5, t5) {
                var n5 = v.impl.options.onImageError;
                if ("function" == typeof n5) try {
                  n5({ url: a3, message: e5, status: o3.status, willUsePlaceholder: t5 });
                } catch (e6) {
                  S("onImageError handler threw:", e6);
                }
              }
              if (o3.timeout = v.impl.options.httpTimeout, o3.onerror = t4, o3.ontimeout = t4, o3.onloadend = function() {
                var e5;
                o3.readyState === XMLHttpRequest.DONE && (0 === (e5 = o3.status) && a3.toLowerCase().startsWith("file://") || 200 <= e5 && e5 <= 300 && null !== o3.response ? (e5 = o3.response) instanceof Blob ? n4(e5) : r3("Response was not a Blob (got " + typeof e5 + ") while fetching resource: " + a3) : t4());
              }, 0 < v.impl.options.useCredentialsFilters.length && (v.impl.options.useCredentials = 0 < v.impl.options.useCredentialsFilters.filter((e5) => 0 <= a3.search(e5)).length), v.impl.options.useCredentials && (o3.withCredentials = true), v.impl.options.corsImg && 0 === a3.indexOf("http") && -1 === a3.indexOf(window.location.origin)) {
                var e4 = "POST" === (v.impl.options.corsImg.method || "GET").toUpperCase() ? "POST" : "GET";
                o3.open(e4, (v.impl.options.corsImg.url || "").replace("#{cors}", a3), true);
                let t5 = false, n5 = v.impl.options.corsImg.headers || {}, r4 = (Object.keys(n5).forEach(function(e5) {
                  -1 !== n5[e5].indexOf("application/json") && (t5 = true), o3.setRequestHeader(e5, n5[e5]);
                }), ((e5) => {
                  try {
                    return JSON.parse(JSON.stringify(e5));
                  } catch (e6) {
                    S("corsImg.data is missing or invalid", e6), i3("corsImg.data is missing or invalid");
                  }
                })(v.impl.options.corsImg.data || ""));
                Object.keys(r4).forEach(function(e5) {
                  "string" == typeof r4[e5] && (r4[e5] = r4[e5].replace("#{cors}", a3));
                }), o3.responseType = "blob", o3.send(t5 ? JSON.stringify(r4) : r4);
              } else o3.open("GET", a3, true), o3.responseType = "blob", o3.send();
            });
          }
          return t3.promise;
        }
        function f2(e3) {
          if (e3.nodeType !== w || "function" != typeof e3.getBBox) return null;
          try {
            var t3 = e3.getBBox();
            return t3 && (t3.width || t3.height) ? t3 : null;
          } catch (e4) {
            return null;
          }
        }
        function m2(t3, n3) {
          if (t3.nodeType === w) {
            let e3 = E(t3).getPropertyValue(n3);
            if ("px" === e3.slice(-2)) return e3 = e3.slice(0, -2), parseFloat(e3);
          }
          return NaN;
        }
      })(), g = /* @__PURE__ */ (() => {
        let r2 = /url\(\s*(["']?)((?:\\.|[^\\)])+)\1\s*\)/gm;
        return { inlineAll: function(t2, r3, o2, i2) {
          if (!e2(t2)) return Promise.resolve(t2);
          return Promise.resolve(t2).then(n2).then(function(e3) {
            return v.impl.options.filterUrls ? e3.filter(function(e4) {
              return v.impl.options.filterUrls(e4, r3);
            }) : e3;
          }).then(function(e3) {
            let n3 = Promise.resolve(t2);
            return e3.forEach(function(t3) {
              n3 = n3.then(function(e4) {
                return s2(e4, t3, r3, o2, i2);
              });
            }), n3;
          });
        }, shouldProcess: e2, impl: { readUrls: n2, inline: s2, urlAsRegex: l2 } };
        function e2(e3) {
          return -1 !== e3.search(r2);
        }
        function n2(e3) {
          for (var t2, n3 = []; null !== (t2 = r2.exec(e3)); ) n3.push(t2[2]);
          return n3.filter(function(e4) {
            return !p.isDataUrl(e4);
          });
        }
        function l2(e3) {
          return new RegExp(`url\\((["']?)(${p.escape(e3)})\\1\\)`, "gm");
        }
        function s2(n3, r3, t2, o2, i2) {
          return Promise.resolve(r3).then(function(e3) {
            return t2 ? p.resolveUrl(e3, t2) : e3;
          }).then(function(e3) {
            return (i2 || p.getAndEncode)(e3, o2);
          }).then(function(e3) {
            var t3 = l2(r3);
            return n3.replace(t3, `url($1${e3}$1)`);
          });
        }
      })(), e = { resolveAll: function() {
        return t().then(function(e2) {
          return Promise.all(e2.map(function(e3) {
            return e3.resolve();
          }));
        }).then(function(e2) {
          return e2.join("\n");
        });
      }, impl: { readAll: t } };
      function t() {
        return Promise.resolve(p.asArray(document.styleSheets)).then(function(e2) {
          let r2 = "function" == typeof v.impl.options.requestInterceptor, o2 = {};
          return Promise.all(e2.map(function(t3) {
            let n2 = t3.href;
            if (!n2 || o2[n2]) return t3;
            o2[n2] = true;
            var e3 = ((e4) => {
              try {
                return !e4.cssRules;
              } catch (e5) {
                return true;
              }
            })(t3) && ((e4) => {
              var t4 = v.impl.options.loadExternalStyleSheet;
              if ("function" == typeof t4) try {
                return true === t4(e4);
              } catch (e5) {
                return S("domtoimage: loadExternalStyleSheet predicate threw:", e5), false;
              }
              return true === t4;
            })(n2);
            return r2 || e3 ? p.getResourceText(n2, y.STYLESHEET, e3).then(function(e4) {
              return e4 && ((e5, t4) => {
                try {
                  var n3 = document.implementation.createHTMLDocument(""), r3 = n3.createElement("style");
                  return r3.appendChild(document.createTextNode(((e6, r4) => e6.replace(/url\((['"]?)([^'")]+)\1\)/g, function(e7, t5, n4) {
                    n4 = n4.trim();
                    return p.isDataUrl(n4) || /^[a-z][a-z0-9+.-]*:/i.test(n4) ? e7 : `url(${t5}${p.resolveUrl(n4, r4)}${t5})`;
                  }))(e5, t4))), n3.body.appendChild(r3), r3.sheet;
                } catch (e6) {
                  return null;
                }
              })(e4, n2) || t3;
            }) : t3;
          }));
        }).then(function(e2) {
          let n2 = [];
          return e2.forEach(function(t3) {
            var e3 = Object.getPrototypeOf(t3);
            if (Object.prototype.hasOwnProperty.call(e3, "cssRules")) try {
              p.asArray(t3.cssRules || []).forEach(n2.push.bind(n2));
            } catch (e4) {
              v.impl.options.ignoreCSSRuleErrors || S("domtoimage: Error while reading CSS rules from: " + t3.href, e4);
            }
          }), n2;
        }).then(function(e2) {
          return e2.filter(function(e3) {
            return e3.type === CSSRule.FONT_FACE_RULE;
          }).filter(function(e3) {
            return g.shouldProcess(e3.style.getPropertyValue("src"));
          });
        }).then(function(e2) {
          return e2.map(t2);
        });
        function t2(t3) {
          return { resolve: function() {
            var e2 = (t3.parentStyleSheet || {}).href;
            return g.inlineAll(t3.cssText, e2, y.FONT);
          }, src: function() {
            return t3.style.getPropertyValue("src");
          } };
        }
      }
      let n = { inlineAll: function t2(e2) {
        if (!p.isElement(e2)) return Promise.resolve(e2);
        return n2(e2).then(function() {
          return p.isHTMLImageElement(e2) ? r(e2).inline() : p.isSVGImageElement(e2) ? o(e2) : Promise.all(p.asArray(e2.childNodes).map(function(e3) {
            return t2(e3);
          }));
        });
        function n2(r2) {
          if (!r2.style) return Promise.resolve(r2);
          let e3 = ["background", "background-image", "mask", "mask-image", "-webkit-mask", "-webkit-mask-image"], t3 = e3.map(function(t4) {
            let e4 = r2.style.getPropertyValue(t4), n3 = r2.style.getPropertyPriority(t4);
            return e4 ? g.inlineAll(e4, void 0, y.CSS_IMAGE).then(function(e5) {
              r2.style.setProperty(t4, e5, n3);
            }) : Promise.resolve();
          });
          return Promise.all(t3).then(function() {
            return r2;
          });
        }
      }, impl: { newImage: r } };
      function r(n2) {
        return { inline: function(t2) {
          if (p.isDataUrl(n2.src)) return Promise.resolve();
          return Promise.resolve(n2.src).then(function(e2) {
            return (t2 || p.getAndEncode)(e2, y.IMAGE);
          }).then(function(t3) {
            return new Promise(function(e2) {
              n2.onload = e2, n2.onerror = e2, n2.src = t3;
            });
          });
        } };
      }
      function o(t2, n2) {
        let r2 = "http://www.w3.org/1999/xlink";
        var e2 = t2.getAttribute("href") || t2.getAttributeNS(r2, "href") || t2.getAttribute("xlink:href");
        return !e2 || p.isDataUrl(e2) ? Promise.resolve(t2) : Promise.resolve(e2).then(function(e3) {
          return (n2 || p.getAndEncode)(e3, y.IMAGE);
        }).then(function(e3) {
          return e3 && (t2.setAttributeNS(r2, "xlink:href", e3), t2.setAttribute("href", e3)), t2;
        });
      }
      let h = { position: "fixed", left: "-9999px", visibility: "hidden" }, i = { warn: function(...e2) {
        console.warn(...e2);
      }, error: function(...e2) {
        console.error(...e2);
      } }, l = { copyDefaultStyles: true, imagePlaceholder: void 0, cacheBust: false, useCredentials: false, useCredentialsFilters: [], httpTimeout: 3e4, styleCaching: "strict", corsImg: void 0, adjustClonedNode: void 0, filterStyles: void 0, filterUrls: void 0, adjustPseudoElement: void 0, onImageError: void 0, ensureShown: false, pixelRatio: 1, preserveScroll: false, ignoreCSSRuleErrors: false, requestInterceptor: void 0, loadExternalStyleSheet: false, logger: i }, y = Object.freeze({ IMAGE: "image", CSS_IMAGE: "css-image", FONT: "font", STYLESHEET: "stylesheet" }), v = { toSvg: a, toPng: function(e2, t2) {
        return c(e2, t2).then(function(e3) {
          return e3.toDataURL();
        });
      }, toJpeg: function(e2, t2) {
        return c(e2, t2).then(function(e3) {
          return e3.toDataURL("image/jpeg", (t2 ? t2.quality : void 0) || 1);
        });
      }, toBlob: function(e2, t2) {
        return c(e2, t2).then(p.canvasToBlob);
      }, toPixelData: function(t2, e2) {
        return c(t2, e2).then(function(e3) {
          return e3.getContext("2d").getImageData(0, 0, p.width(t2), p.height(t2)).data;
        });
      }, toCanvas: c, ResourceType: y, impl: { fontFaces: e, images: n, util: p, inliner: g, urlCache: [], options: {}, copyOptions: function(t2) {
        Object.keys(l).forEach(function(e2) {
          v.impl.options[e2] = (void 0 === t2[e2] ? l : t2)[e2];
        });
      }, resetUrlCache: f } };
      function f() {
        v.impl.urlCache = [];
      }
      "object" == typeof exports && "object" == typeof module ? module.exports = v : d.domtoimage = v;
      let w = ("undefined" != typeof Node ? Node.ELEMENT_NODE : void 0) || 1, E = s("getComputedStyle"), b = s("atob");
      function s(e2) {
        return (void 0 !== d ? d[e2] : void 0) || ("undefined" != typeof window ? window[e2] : void 0) || globalThis[e2];
      }
      function m(...e2) {
        u("warn", e2);
      }
      function S(...e2) {
        u("error", e2);
      }
      function u(e2, t2) {
        var n2 = v.impl.options.logger || i, e2 = n2[e2];
        "function" == typeof e2 && e2.apply(n2, t2);
      }
      function a(s2, u2) {
        let i2 = v.impl.util.getWindow(s2), o2 = (u2 = u2 || {}, v.impl.copyOptions(u2), []);
        return T = [], i2 && i2.document ? (() => {
          var e2 = i2.document;
          if (!e2.fonts || !e2.fonts.ready) return Promise.resolve();
          let t2 = v.impl.options.httpTimeout || 3e4, n2, r2 = Promise.resolve(e2.fonts.ready).then(function() {
            return false;
          }, function() {
            return false;
          }), o3 = new Promise(function(e3) {
            n2 = i2.setTimeout(function() {
              e3(true);
            }, t2);
          });
          return Promise.race([r2, o3]).then(function(e3) {
            i2.clearTimeout(n2), e3 && m("dom-to-image-more: timed out after " + t2 + "ms waiting for document fonts to finish loading (document.fonts.ready); rendering anyway \u2014 the output may have missing glyphs or fallback-font metrics.");
          });
        })().then(function() {
          var e2 = s2;
          if (e2.nodeType === w) return e2;
          var t2, n2 = e2, r2 = e2.parentNode;
          if (r2) return t2 = document.createElement("span"), r2.replaceChild(t2, n2), t2.append(e2), o2.push({ parent: r2, child: n2, wrapper: t2 }), t2;
          throw new Error("Cannot render a non-element node that is not attached to a parent; wrap it in an element or attach it to the document first.");
        }).then(function(e2) {
          return (function l2(t2, d2, h2, s3) {
            let e3 = d2.filter;
            if (t2 === P || p.isHTMLScriptElement(t2) || p.isHTMLStyleElement(t2) || p.isHTMLLinkElement(t2) || null !== h2 && e3 && !e3(t2)) return Promise.resolve();
            return Promise.resolve(t2).then(n2).then(r2).then(function(e4) {
              return u3(e4, i3(t2));
            }).then(o3).then(function(e4) {
              return a3(e4, t2);
            });
            function n2(e4) {
              return p.isHTMLCanvasElement(e4) ? p.makeImage(e4.toDataURL()) : e4.cloneNode(false);
            }
            function r2(e4) {
              return d2.adjustClonedNode && d2.adjustClonedNode(t2, e4, false), Promise.resolve(e4);
            }
            function o3(e4) {
              return d2.adjustClonedNode && d2.adjustClonedNode(t2, e4, true), Promise.resolve(e4);
            }
            function i3(e4) {
              return p.isElementHostForOpenShadowRoot(e4) ? e4.shadowRoot : e4;
            }
            function u3(n3, e4) {
              let r3 = t3(e4), o4 = Promise.resolve();
              if (0 !== r3.length) {
                let t4 = E(i4(e4));
                p.asArray(r3).forEach(function(e5) {
                  o4 = o4.then(function() {
                    return l2(e5, d2, t4, s3).then(function(e6) {
                      e6 && n3.appendChild(e6);
                    });
                  });
                });
              }
              return o4.then(function() {
                return n3;
              });
              function i4(e5) {
                return p.isShadowRoot(e5) ? e5.host : e5;
              }
              function t3(t4) {
                if (p.isShadowSlotElement(t4)) {
                  let e5 = t4.assignedNodes();
                  if (e5 && 0 < e5.length) return e5;
                }
                return t4.childNodes;
              }
            }
            function a3(a4, c3) {
              return !p.isElement(a4) || p.isShadowSlotElement(c3) ? Promise.resolve(a4) : Promise.resolve().then(n3).then(o4).then(i4).then(l3).then(t3).then(e4).then(s4).then(u4).then(r3).then(function() {
                return a4;
              });
              function e4() {
                if (d2.preserveScroll && a4.style) {
                  let e5 = c3.scrollLeft || 0, t4 = c3.scrollTop || 0;
                  if (0 !== e5 || 0 !== t4) {
                    a4.style.overflow = "hidden";
                    let n4 = `translate(${-e5}px, ${-t4}px)`;
                    p.asArray(a4.children).forEach(function(t5) {
                      if (t5.style) {
                        let e6 = t5.style.transform && "none" !== t5.style.transform ? " " + t5.style.transform : "";
                        t5.style.transform = n4 + e6;
                      }
                    });
                  }
                }
              }
              function t3() {
                if (a4.attributes && a4.removeAttribute) {
                  let n4 = [];
                  for (let t4 = 0; t4 < a4.attributes.length; t4 += 1) {
                    let e5 = a4.attributes[t4].name;
                    /["'=<>/\s]/.test(e5) && n4.push(e5);
                  }
                  n4.forEach(function(e5) {
                    a4.removeAttribute(e5);
                  });
                }
              }
              function n3() {
                if (p.isHTMLImageElement(c3) && "function" == typeof c3.decode && !(c3.complete && 0 < c3.naturalWidth)) return c3.decode().catch(function() {
                });
              }
              function r3() {
                p.isHTMLImageElement(a4) && (a4.removeAttribute("loading"), c3.srcset || c3.sizes) && (a4.removeAttribute("srcset"), a4.removeAttribute("sizes"), a4.src = c3.currentSrc || c3.src);
              }
              function o4() {
                function e5() {
                  let t5 = E(c3).getPropertyValue("visibility");
                  if (null === h2) "visible" !== t5 && a4.style.setProperty("visibility", "visible");
                  else {
                    let e6 = h2.getPropertyValue("visibility");
                    t5 === e6 && a4.style.removeProperty("visibility");
                  }
                }
                function r4(e6, t5) {
                  t5.font = e6.font, t5.fontFamily = e6.fontFamily, t5.fontFeatureSettings = e6.fontFeatureSettings, t5.fontKerning = e6.fontKerning, t5.fontSize = e6.fontSize, t5.fontStretch = e6.fontStretch, t5.fontStyle = e6.fontStyle, t5.fontVariant = e6.fontVariant, t5.fontVariantCaps = e6.fontVariantCaps, t5.fontVariantEastAsian = e6.fontVariantEastAsian, t5.fontVariantLigatures = e6.fontVariantLigatures, t5.fontVariantNumeric = e6.fontVariantNumeric, t5.fontVariationSettings = e6.fontVariationSettings, t5.fontWeight = e6.fontWeight;
                }
                function t4(e6, t5) {
                  let n4 = E(e6);
                  n4.cssText ? (t5.style.cssText = n4.cssText, r4(n4, t5.style)) : (I(d2, e6, n4, h2, t5), null === h2 && (["inset-block", "inset-block-start", "inset-block-end"].forEach((e7) => t5.style.removeProperty(e7)), ["left", "right", "top", "bottom"].forEach((e7) => {
                    t5.style.getPropertyValue(e7) && t5.style.setProperty(e7, "0px");
                  })));
                }
                a4.style && (t4(c3, a4), e5());
              }
              function i4() {
                let u5 = p.uid();
                return Promise.all([":before", ":after"].map(e5));
                function e5(o5) {
                  let i5 = E(c3, o5), l4 = i5.getPropertyValue("content");
                  if ("" !== l4 && "none" !== l4) {
                    let s6 = function() {
                      let e7 = p.asArray(i5).map(t5).join("; ");
                      return e7 + ";";
                      function t5(e8) {
                        let t6 = i5.getPropertyValue(e8), n5 = i5.getPropertyPriority(e8) ? " !important" : "";
                        return e8 + ": " + t6 + n5;
                      }
                    };
                    var s5 = s6;
                    let t4;
                    if (d2.adjustPseudoElement) {
                      let e7 = d2.adjustPseudoElement(c3, o5, i5);
                      if (false === e7) return;
                      e7 && "object" == typeof e7 && (t4 = e7);
                    }
                    let e6 = a4.getAttribute("class") || "", n4 = (a4.setAttribute("class", e6 + " " + u5), `.${u5}:` + o5), r4 = i5.cssText ? `${i5.cssText} content: ${l4};` : s6();
                    return t4 && (r4 += Object.keys(t4).map(function(e7) {
                      return ` ${e7}: ${t4[e7]};`;
                    }).join("")), g.inlineAll(r4, void 0, y.CSS_IMAGE).then(function(e7) {
                      let t5 = document.createElement("style");
                      t5.appendChild(document.createTextNode(n4 + `{${e7}}`)), a4.appendChild(t5);
                    });
                  }
                }
              }
              function l3() {
                p.isHTMLTextAreaElement(c3) && (a4.innerHTML = c3.value), p.isHTMLInputElement(c3) && a4.setAttribute("value", c3.value);
              }
              function s4() {
                p.isSVGElement(a4) && (a4.setAttribute("xmlns", "http://www.w3.org/2000/svg"), p.isSVGRectElement(a4) && ["width", "height"].forEach(function(e5) {
                  let t4 = a4.getAttribute(e5);
                  t4 && a4.style.setProperty(e5, t4);
                }), p.isSVGUseElement(a4)) && m2(c3);
              }
              function u4() {
                if (p.isElement(a4) && f2()) {
                  let e5 = E(c3).getPropertyValue("display");
                  "table" !== e5 && "inline-table" !== e5 || (a4.style.removeProperty("height"), a4.style.removeProperty("block-size"));
                }
              }
              function f2() {
                let t4 = c3.children || [];
                for (let e5 = 0; e5 < t4.length; e5 += 1) if ("CAPTION" === t4[e5].tagName) return true;
                return false;
              }
              function m2(e5) {
                let t4 = e5.getAttribute("href") || e5.getAttributeNS("http://www.w3.org/1999/xlink", "href") || e5.getAttribute("xlink:href");
                if (t4 && "#" === t4.charAt(0)) {
                  let n4 = t4.slice(1);
                  if (!T.some((e6) => e6.id === n4)) {
                    let t5 = e5.ownerDocument.getElementById(n4);
                    if (t5) {
                      let e6 = t5.cloneNode(true);
                      e6.setAttribute("xmlns", "http://www.w3.org/2000/svg"), T.push({ id: n4, node: e6 });
                    }
                  }
                }
              }
            }
          })(e2, u2, null, i2);
        }).then(function(e2) {
          if (0 !== T.length) {
            var o3 = "http://www.w3.org/2000/svg", i3 = document.createElementNS(o3, "svg");
            i3.setAttribute("xmlns", o3), i3.setAttribute("width", "0"), i3.setAttribute("height", "0"), i3.style.setProperty("position", "absolute"), i3.style.setProperty("width", "0"), i3.style.setProperty("height", "0"), i3.style.setProperty("overflow", "hidden");
            let t2 = document.createElementNS(o3, "defs"), n2 = (i3.appendChild(t2), /* @__PURE__ */ new Set()), r2 = (e2.getAttribute("id") && n2.add(e2.getAttribute("id")), e2.querySelectorAll("[id]").forEach(function(e3) {
              n2.add(e3.getAttribute("id"));
            }), 0);
            T.forEach(function(e3) {
              n2.has(e3.id) || (t2.appendChild(e3.node), r2 += 1);
            }), 0 < r2 && e2.insertBefore(i3, e2.firstChild);
          }
          return e2;
        }).then(u2.disableEmbedFonts ? Promise.resolve(s2) : A).then(u2.disableInlineImages ? Promise.resolve(s2) : C).then(function(e2) {
          e2.style && (e2.style.margin = "0");
          u2.bgcolor && (e2.style.backgroundColor = u2.bgcolor);
          u2.width && (e2.style.width = u2.width + "px");
          u2.height && (e2.style.height = u2.height + "px");
          u2.style && Object.assign(e2.style, u2.style);
          let t2 = null;
          "function" == typeof u2.onclone && (t2 = u2.onclone(e2));
          return Promise.resolve(t2).then(function() {
            return e2;
          });
        }).then(function(e2) {
          if (p.isSVGElement(s2) && !p.isSVGSVGElement(s2)) return ((e3) => {
            let r3 = "http://www.w3.org/2000/svg", t3 = c2(e3), o3;
            try {
              o3 = s2.getBBox();
            } catch (e4) {
              o3 = { x: 0, y: 0, width: 0, height: 0 };
            } finally {
              t3();
            }
            e3.removeAttribute("transform"), e3.style.removeProperty("transform");
            let i3 = u2.width || o3.width, l2 = u2.height || o3.height;
            return Promise.resolve(e3).then(function(e4) {
              return e4.setAttribute("xmlns", r3), new XMLSerializer().serializeToString(e4);
            }).then(a2).then(p.escapeXhtml).then(function(e4) {
              var t4 = (p.isDimensionMissing(i3) ? "" : ` width="${i3}"`) + (p.isDimensionMissing(l2) ? "" : ` height="${l2}"`), n3 = `${o3.x} ${o3.y} ${o3.width} ` + o3.height;
              return `<svg xmlns="${r3}"${t4} viewBox="${n3}">${e4}</svg>`;
            }).then(function(e4) {
              return "data:image/svg+xml;charset=utf-8," + e4;
            });
          })(e2);
          let t2 = c2(e2), n2, r2;
          try {
            n2 = u2.width || p.width(s2), r2 = u2.height || p.height(s2);
          } finally {
            t2();
          }
          return Promise.resolve(e2).then(function(e3) {
            return e3.setAttribute("xmlns", "http://www.w3.org/1999/xhtml"), new XMLSerializer().serializeToString(e3);
          }).then(a2).then(p.escapeXhtml).then(function(e3) {
            var t3 = (p.isDimensionMissing(n2) ? ' width="100%"' : ` width="${n2}"`) + (p.isDimensionMissing(r2) ? ' height="100%"' : ` height="${r2}"`);
            return `<svg xmlns="http://www.w3.org/2000/svg"${(p.isDimensionMissing(n2) ? "" : ` width="${n2}"`) + (p.isDimensionMissing(r2) ? "" : ` height="${r2}"`)}><foreignObject${t3}>${e3}</foreignObject></svg>`;
          }).then(function(e3) {
            return "data:image/svg+xml;charset=utf-8," + e3;
          });
        }).finally(function() {
          (() => {
            for (; 0 < o2.length; ) {
              var e2 = o2.pop();
              try {
                e2.parent.replaceChild(e2.child, e2.wrapper);
              } catch (e3) {
                S("domtoimage: failed to restore wrapped node", e3);
              }
            }
          })(), f(), T = [], (() => {
            P && (P.remove(), P = null), L && clearTimeout(L), L = setTimeout(() => {
              L = null, V = {};
            }, 2e4);
          })();
        }) : Promise.reject(new Error("dom-to-image-more: a browser DOM is required (SSR)"));
        function a2(e2) {
          return e2.replace(/url\(&quot;([^]*?)&quot;\)/g, function(e3, t2) {
            return 0 <= t2.indexOf("'") ? e3 : `url('${t2}')`;
          });
        }
        function c2(t2) {
          function e2() {
          }
          if (!u2.ensureShown) return e2;
          var n2 = E(s2);
          if ("0" === n2.getPropertyValue("opacity") && t2.style.setProperty("opacity", "1"), "none" !== n2.getPropertyValue("display")) return e2;
          let r2 = s2.style.getPropertyValue("display"), o3 = s2.style.getPropertyPriority("display");
          return s2.style.removeProperty("display"), "none" === E(s2).getPropertyValue("display") && (n2 = r2 && "none" !== r2 ? r2 : "revert", s2.style.setProperty("display", n2, "important")), function() {
            var e3 = E(s2).getPropertyValue("display");
            t2.style.setProperty("display", "none" === e3 ? "block" : e3), r2 ? s2.style.setProperty("display", r2, o3) : s2.style.removeProperty("display");
          };
        }
      }
      function c(i2, l2) {
        return a(i2, l2 = l2 || {}).then(p.makeImage).then(function(e2) {
          var t2 = ((e3) => {
            let t3 = l2.width || p.width(e3), n3 = l2.height || p.height(e3);
            p.isDimensionMissing(t3) && (t3 = p.isDimensionMissing(n3) ? 300 : 2 * n3), p.isDimensionMissing(n3) && (n3 = t3 / 2);
            var r3, e3 = ("number" == typeof l2.scale ? l2.scale : 1) * ("number" == typeof l2.pixelRatio ? l2.pixelRatio : 1), e3 = ((e4, t4, n4) => {
              var r4 = 16384, o4 = 0 < e4 && 0 < t4 && 0 < n4;
              return !o4 || (o4 = Math.min(r4 / e4, r4 / t4, Math.sqrt(268435456 / (e4 * t4))), n4 <= o4) ? n4 : (m("dom-to-image-more: the requested " + Math.round(e4 * n4) + "\xD7" + Math.round(t4 * n4) + " canvas exceeds the browser limit; clamping the effective scale from " + n4 + " to " + o4 + ". Capture detail may be reduced \u2014 render a smaller region or lower scale/pixelRatio."), o4);
            })(t3, n3, e3), o3 = document.createElement("canvas");
            return o3.width = t3 * e3, o3.height = n3 * e3, l2.bgcolor && ((r3 = o3.getContext("2d")).fillStyle = l2.bgcolor, r3.fillRect(0, 0, o3.width, o3.height)), { canvas: o3, scale: e3, width: t3, height: n3 };
          })(i2), n2 = t2.canvas, r2 = t2.scale, o2 = n2.getContext("2d");
          return o2.msImageSmoothingEnabled = false, o2.imageSmoothingEnabled = false, e2 && (o2.scale(r2, r2), o2.drawImage(e2, 0, 0, t2.width, t2.height)), n2;
        });
      }
      let P = null, T = [];
      function A(n2) {
        return e.resolveAll().then(function(e2) {
          var t2;
          return "" !== e2 && (t2 = document.createElement("style"), n2.appendChild(t2), t2.appendChild(document.createTextNode(e2))), n2;
        });
      }
      function C(e2) {
        return n.inlineAll(e2).then(function() {
          return e2;
        });
      }
      function x(e2, t2, n2, r2) {
        var o2 = 0 <= ["background-clip"].indexOf(t2);
        r2 ? (e2.setProperty(t2, n2, r2), o2 && e2.setProperty("-webkit-" + t2, n2, r2)) : (e2.setProperty(t2, n2), o2 && e2.setProperty("-webkit-" + t2, n2));
      }
      let M = /* @__PURE__ */ Symbol("dtim-ua-relative-font-size");
      function I(o2, i2, l2, s2, e2) {
        let u2 = v.impl.options.copyDefaultStyles ? ((t2, e3) => {
          var n2, r3 = ((e4) => {
            var t3 = [];
            do {
              if (e4.nodeType === w) {
                var n3 = e4.tagName;
                if (t3.push(n3), N.includes(n3)) break;
              }
            } while (e4 = e4.parentNode);
            return t3;
          })(e3), o3 = ((e4) => ("relaxed" !== t2.styleCaching ? e4 : e4.filter((e5, t3, n3) => 0 === t3 || t3 === n3.length - 1)).join(">"))(r3) + ((t3) => t3 && t3.hasAttribute ? O.filter(function(e4) {
            return t3.hasAttribute(e4);
          }).map(function(e4) {
            return `[${e4}]`;
          }).join("") : "")(e3);
          {
            if (V[o3]) return V[o3];
            n2 = (() => {
              if (P) return P.contentWindow;
              t3 = document.characterSet || "UTF-8", e4 = (e4 = document.doctype) ? (`<!DOCTYPE ${s4(e4.name)} ${s4(e4.publicId)} ` + s4(e4.systemId)).trim() + ">" : "", (P = document.createElement("iframe")).id = "domtoimage-sandbox-" + p.uid(), Object.assign(P.style, h), document.body.appendChild(P);
              var e4, t3, n3 = P, r4 = "domtoimage-sandbox";
              try {
                return n3.contentWindow.document.write(e4 + `<html><head><meta charset='${t3}'><title>${r4}</title></head><body></body></html>`), n3.contentWindow;
              } catch (e5) {
              }
              var o4 = document.createElement("meta");
              o4.setAttribute("charset", t3);
              try {
                var i4 = document.implementation.createHTMLDocument(r4), l4 = (i4.head.appendChild(o4), e4 + i4.documentElement.outerHTML);
                return n3.setAttribute("srcdoc", l4), n3.contentWindow;
              } catch (e5) {
              }
              return n3.contentDocument.head.appendChild(o4), n3.contentDocument.title = r4, n3.contentWindow;
              function s4(e5) {
                var t4;
                return e5 ? ((t4 = document.createElement("div")).innerText = e5, t4.innerHTML) : "";
              }
            })();
            var i3 = r3 = ((e4, t3) => {
              let n3 = e4.body;
              do {
                var r4 = t3.pop(), r4 = e4.createElement(r4);
                n3.appendChild(r4), n3 = r4;
              } while (0 < t3.length);
              return n3.textContent = "\u200B", n3;
            })(n2.document, r3), l3 = e3, s3 = (l3 && l3.hasAttribute && O.forEach(function(e4) {
              l3.hasAttribute(e4) && i3.setAttribute(e4, l3.getAttribute(e4));
            }), e3 = ((e4, t3) => {
              let n3 = {}, r4 = e4.getComputedStyle(t3), o4 = (p.asArray(r4).forEach(function(e5) {
                n3[e5] = "width" === e5 || "height" === e5 ? "auto" : r4.getPropertyValue(e5);
              }), t3.parentElement);
              return o4 && (t3 = e4.getComputedStyle(o4).getPropertyValue("font-size"), n3[M] = n3["font-size"] !== t3), n3;
            })(n2, r3), r3);
            do {
              var u3 = s3.parentElement;
              null !== u3 && u3.removeChild(s3), s3 = u3;
            } while (s3 && "BODY" !== s3.tagName);
            return V[o3] = e3;
          }
        })(o2, i2) : {}, a2 = e2.style;
        var r2, c2;
        p.asArray(l2).forEach(function(e3) {
          var t2, n2, r3;
          o2.filterStyles && !o2.filterStyles(i2, e3) || (t2 = l2.getPropertyValue(e3), r3 = u2[e3], n2 = s2 ? s2.getPropertyValue(e3) : void 0, a2.getPropertyValue(e3)) || (t2 !== r3 || s2 && t2 !== n2 || "font-size" === e3 && u2[M]) && (r3 = l2.getPropertyPriority(e3), x(a2, e3, t2, r3));
        }), r2 = l2, c2 = a2, ["top", "right", "bottom", "left"].forEach(function(e3) {
          var t2, n2 = `border-${e3}-width`, e3 = r2.getPropertyValue(`border-${e3}-style`);
          e3 && "none" !== e3 && !c2.getPropertyValue(n2) && (e3 = r2.getPropertyValue(n2)) && (t2 = r2.getPropertyPriority(n2), x(c2, n2, e3, t2));
        });
      }
      let L = null, V = {}, N = ["ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DETAILS", "DIALOG", "DD", "DIV", "DL", "DT", "FIELDSET", "FIGCAPTION", "FIGURE", "FOOTER", "FORM", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HGROUP", "HR", "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "SVG", "TABLE", "UL", "math", "svg", "BODY", "HEAD", "HTML"], O = ["href"];
    })(exports);
  }
});
export default require_dom_to_image_more_min();
//# sourceMappingURL=chunk-H4HDFVZN.js.map
