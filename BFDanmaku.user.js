// ==UserScript==
// @name         BFDanmaku - A站旧高级弹幕复活
// @namespace    https://github.com/mg13666/BFDanmaku
// @version      1.2.0
// @description  在A站视频页面生成"启用高级弹幕"按钮，点击后从A站弹幕池加载数据，用BFDanmaku渲染
// @author       mg13666 / boomfun
// @match        https://www.acfun.cn/v/*
// @require      https://raw.githubusercontent.com/mg13666/BFDanmaku/master/dist/BFDanmaku.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  var DEV_MODE = true;

  // ==================== 精简Color ====================
  var BFColor = (function () {
    function Color(r, g, b, a) {
      this.r = r !== undefined ? r : 255;
      this.g = g !== undefined ? g : 255;
      this.b = b !== undefined ? b : 255;
      this.a = a !== undefined ? a : 255;
    }
    Color.fromHEX = function (h) {
      h = h.replace("#", "");
      for (var i = 0; i < 6 - h.length; i++) h = "0" + h;
      if (h.length === 7) h = "0" + h;
      return new Color(
        parseInt("0x" + h[0] + h[1]),
        parseInt("0x" + h[2] + h[3]),
        parseInt("0x" + h[4] + h[5]),
        h[6] !== undefined ? parseInt("0x" + h[6] + h[7]) : 255
      );
    };
    Color.fromDEC = function (d) { return Color.fromHEX(d.toString(16)); };
    return Color;
  })();

  // ==================== AcfunParser (c-m -> DanmakuConfig) ====================
  var AcfunParser = (function () {
    var parentList = {}, waitForParent = {}, waitForMask = {};
    var AnchorType = { leftTop: 0, middleTop: 1, rightTop: 2, leftMiddle: 3, middle: 4, rightMiddle: 5, leftBottom: 6, middleBottom: 7, rightBottom: 8 };

    function pBM(bm) {
      if ((bm >= 6 && bm <= 8) || bm >= 11) return 0;
      else if (bm > 6 && bm < 11) return bm - 3;
      else { if (bm === 1) return 2; return bm; }
    }
    function getContent(o) {
      return o.w && o.w.g && o.w.g.d ? { type: 1, content: o.w.g.d } : { type: 0, content: o.n.replace(/\r/g, "\n") };
    }
    function getConfig(o) {
      return {
        anchor: o.c !== undefined ? Number(o.c) : 0,
        zindex: o.dep ? Number(o.dep) : 0,
        filter: o.w && o.w.l ? parseFilter(o.w.l) : undefined,
        bm: o.bm !== undefined ? Number(o.bm) : 0,
        word: {
          bold: o.w && o.w.b !== undefined ? o.w.b : false,
          stroke: o.b !== undefined ? o.b : false,
          font: o.w && o.w.f ? (o.w.f === "微软雅黑" || o.w.f === "Microsoft YaHei" ? "微软雅黑" : o.w.f) : undefined,
        },
      };
    }
    function parseFilter(arr) {
      var res = [];
      for (var i = 0; i < arr.length; i++) {
        var s = arr[i], f;
        if (s[0] === 0) f = { type: 1, blur: s[1] };
        else if (s[0] === 1) f = { type: 0, color: BFColor.fromDEC(s[1]), offsetX: 0, offsetY: 0, blur: s[3], knockout: s[8] === true, onlyShadow: false };
        else if (s[0] === 2) f = { type: 0, color: BFColor.fromDEC(s[3]), offsetX: Math.cos((s[2] * Math.PI) / 180) * s[1], offsetY: Math.sin((s[2] * Math.PI) / 180) * s[1], blur: s[5], knockout: s[10] === true, onlyShadow: s[11] === true };
        if (f) res.push(f);
      }
      return res.length ? res : undefined;
    }
    function getAdvanced(o, color) {
      var re = [{
        opacity: o.a !== undefined ? Number(o.a) : 1,
        time: o.l !== undefined ? Number(o.l) * 1000 : 0,
        color: color,
        rotate: { x: o.rx !== undefined ? -o.rx : 0, y: o.k !== undefined ? -o.k : 0, z: o.r !== undefined ? Number(o.r) : 0 },
        point: { x: o.p && o.p.x !== undefined ? Number(o.p.x) : 0, y: o.p && o.p.y !== undefined ? Number(o.p.y) : 0, z: o.pz !== undefined ? -o.pz : 0 },
        scale: { x: o.e !== undefined ? Number(o.e) : 1, y: o.f !== undefined ? Number(o.f) : 1, z: o.sz !== undefined ? Number(o.sz) : 1 },
        transition: 0,
      }];
      if (o.z) {
        var last = re[0];
        for (var i = 0; i < o.z.length; i++) {
          var iz = o.z[i];
          re.push({
            opacity: iz.t !== undefined ? Number(iz.t) : last.opacity,
            time: iz.l * 1000,
            color: iz.c !== undefined ? BFColor.fromDEC(Number(iz.c)) : last.color,
            rotate: { z: iz.d !== undefined ? iz.d : last.rotate.z, y: iz.e !== undefined ? -iz.e : last.rotate.y, x: iz.rx !== undefined ? -iz.rx : last.rotate.x },
            scale: { y: iz.g !== undefined ? Number(iz.g) : last.scale.y, x: iz.f !== undefined ? Number(iz.f) : last.scale.x, z: iz.sz !== undefined ? Number(iz.sz) : last.scale.z },
            point: { x: iz.x !== undefined ? Number(iz.x) : last.point.x, y: iz.y !== undefined ? Number(iz.y) : last.point.y, z: iz.z !== undefined ? -iz.z : last.point.z },
            transition: iz.v !== undefined ? Number(iz.v) : 1,
          });
          last = re[re.length - 1];
        }
      }
      return re;
    }
    function parse(data) {
      parentList = {}; waitForParent = {}; waitForMask = {};
      var res = [];
      for (var i = 0; i < data.length; i++) {
        var item = data[i], c = item.c.split(",");
        if (Number(c[2]) !== 7) continue;
        var id = "bf-o_" + Math.ceil(Math.random() * 1e7) + "_" + Math.ceil(Math.random() * 1e7);
        var color = BFColor.fromDEC(parseInt(c[1]));
        var advance = JSON.parse(item.m);
        var content = getContent(advance), conf = getConfig(advance), adv = getAdvanced(advance, color);
        var o = {
          id: id, content: content.content, startTime: (Number(c[0]) || 0) * 1000,
          anchor: conf.anchor !== undefined ? (AnchorType.hasOwnProperty(conf.anchor) ? AnchorType[conf.anchor] : conf.anchor) : AnchorType.leftTop,
          word: { bold: conf.word.bold, stroke: conf.word.stroke, size: Number(c[3]) || 25, font: conf.word.font || "微软雅黑" },
          contentType: content.type, zindex: conf.zindex, filter: conf.filter, frames: adv,
          parent: undefined, bm: conf.bm !== undefined ? pBM(conf.bm) : 0, mask: undefined,
        };
        if (advance.p) {
          o.parent = advance.p;
          if (parentList[advance.p]) o.parent = parentList[advance.p];
          else { waitForParent[advance.p] = waitForParent[advance.p] || []; waitForParent[advance.p].push(o); }
        }
        parentList[advance.k || advance.id] = id;
        if (advance.mask) {
          if (parentList[advance.mask]) o.mask = parentList[advance.mask];
          else { waitForMask[advance.mask] = waitForMask[advance.mask] || []; waitForMask[advance.mask].push(o); }
        }
        res.push(o);
      }
      for (var key in waitForParent) if (parentList[key]) for (var j = 0; j < waitForParent[key].length; j++) waitForParent[key][j].parent = parentList[key];
      for (var k2 in waitForMask) if (parentList[k2]) for (var k = 0; k < waitForMask[k2].length; k++) waitForMask[k2][k].mask = parentList[k2];
      return res;
    }
    return parse;
  })();

  // ==================== 数据获取 ====================
  function extractResourceId() { var m = location.pathname.match(/ac(\d+)/); return m ? m[1] : null; }

  // 弹幕轮询（分页获取所有弹幕）
  async function fetchAllDanmakus(resourceId, resourceType, onProgress) {
    var allDanmakus = [];
    var seen = {};
    var position = 0;
    var maxRounds = 200;
    var emptyRounds = 0;

    while (maxRounds-- > 0 && emptyRounds < 5) {
      var body = "resourceId=" + resourceId + "&resourceType=" + resourceType + "&position=" + position;
      var res = await fetch("/rest/pc-direct/new-danmaku/pollByPosition", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body,
      });
      var data = await res.json();

      if (data.result !== 0 || !data.danmakus || data.danmakus.length === 0) {
        emptyRounds++;
        position += 30000;
        continue;
      }

      emptyRounds = 0;
      var added = 0;
      for (var i = 0; i < data.danmakus.length; i++) {
        var dm = data.danmakus[i];
        if (!seen[dm.danmakuId]) {
          seen[dm.danmakuId] = true;
          allDanmakus.push(dm);
          added++;
        }
      }

      if (onProgress) onProgress(allDanmakus.length, position);

      // 推进 position 到最后一条弹幕之后
      var maxPos = 0;
      for (var j = 0; j < data.danmakus.length; j++) {
        if (data.danmakus[j].position > maxPos) maxPos = data.danmakus[j].position;
      }
      position = maxPos + 1;

      if (added === 0) emptyRounds++;
    }

    return allDanmakus;
  }

  // ==================== UI ====================
  function createButton(onClick) {
    var btn = document.createElement("button");
    btn.id = "bfdanmaku-btn";
    btn.textContent = "启用高级弹幕";
    btn.style.cssText = "background:linear-gradient(135deg,#fd4e6d,#fda34b);color:#fff;border:none;border-radius:4px;padding:8px 20px;font-size:14px;font-weight:bold;cursor:pointer;";
    btn.addEventListener("mouseenter", function () { btn.style.opacity = "0.85"; });
    btn.addEventListener("mouseleave", function () { btn.style.opacity = "1"; });
    btn.addEventListener("click", onClick);
    return btn;
  }

  function createStatusEl() {
    var el = document.createElement("span");
    el.id = "bfdanmaku-status";
    el.style.cssText = "font-size:12px;color:#aaa;margin-left:12px;";
    return el;
  }

  function insertButton(btn, statusEl) {
    var toolbar = document.createElement("div");
    toolbar.id = "bfdanmaku-toolbar";
    toolbar.style.cssText = "display:flex;align-items:center;justify-content:flex-end;margin-bottom:8px;padding:4px 0;";
    toolbar.appendChild(btn);
    toolbar.appendChild(statusEl);

    var cv = document.querySelector(".container-video");
    if (cv && cv.parentElement) { cv.parentElement.insertBefore(toolbar, cv); return true; }

    var frame = document.querySelector(".frame");
    if (frame && frame.parentElement) { frame.parentElement.insertBefore(toolbar, frame); return true; }

    document.body.insertBefore(toolbar, document.body.firstChild);
    return true;
  }

  // ==================== 渲染核心 ====================
  function createStageOverlay(container) {
    var div = document.createElement("div");
    div.id = "bfdanmaku-stage";
    div.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;";
    if (getComputedStyle(container).position === "static") container.style.position = "relative";
    container.appendChild(div);
    return div;
  }

  function pushDanmakusToPool(danmakuList, pool) {
    if (!danmakuList || !danmakuList.length) return 0;
    var advItems = [], normalItems = [];
    for (var i = 0; i < danmakuList.length; i++) {
      var dm = danmakuList[i];
      if (dm.danmakuType === 7) advItems.push(dm);
      else normalItems.push(dm);
    }

    var count = 0;
    if (advItems.length) {
      try {
        var parsed = AcfunParser(advItems);
        for (var a = 0; a < parsed.length; a++) { pool.push(parsed[a]); count++; }
        if (DEV_MODE) console.log("[BFDanmaku] 🎬 高级弹幕 " + parsed.length + " 条");
      } catch (e) { console.error("[BFDanmaku] 解析失败:", e); }
    }

    for (var n = 0; n < normalItems.length; n++) {
      var dm2 = normalItems[n];
      pool.push({
        id: "dm-" + dm2.danmakuId,
        content: dm2.body,
        startTime: dm2.position || 0,
        anchor: 0,
        word: { bold: false, stroke: false, size: dm2.size || 25, font: "微软雅黑" },
        contentType: 0, zindex: 0,
        frames: [{ opacity: 1, time: 10000, color: BFColor.fromDEC(dm2.color || 0xffffff), rotate: { x: 0, y: 0, z: 0 }, point: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, transition: 0 }],
      });
      count++;
    }
    return count;
  }

  // ==================== 工具 ====================
  function waitFor(sel, timeout) {
    timeout = timeout || 30000;
    return new Promise(function (resolve, reject) {
      var el = document.querySelector(sel);
      if (el) return resolve(el);
      var ob = new MutationObserver(function () {
        var e2 = document.querySelector(sel);
        if (e2) { ob.disconnect(); resolve(e2); }
      });
      ob.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { ob.disconnect(); reject(new Error("超时: " + sel)); }, timeout);
    });
  }

  // ==================== 主逻辑 ====================
  async function main() {
    console.log("[BFDanmaku] v1.2.0");

    if (!window.DanmakuPool || !window.DanmakuStage) {
      console.error("[BFDanmaku] 引擎未加载");
      return;
    }

    var video;
    try { video = await waitFor("video"); }
    catch (e) { console.error("[BFDanmaku] 未找到video"); return; }

    var container =
      document.querySelector(".container-video") ||
      document.querySelector(".frame") ||
      video.parentElement;

    var resourceId = extractResourceId();
    if (!resourceId) { console.error("[BFDanmaku] 无resourceId"); return; }

    console.log("[BFDanmaku] video=" + video.videoWidth + "x" + video.videoHeight + " resourceId=" + resourceId);

    var engineReady = false, pool, stage, stageDiv;
    function initEngine() {
      if (engineReady) return;
      stageDiv = createStageOverlay(container);
      pool = new window.DanmakuPool();
      stage = new window.DanmakuStage(stageDiv, pool, video.videoWidth || 1280, video.videoHeight || 720, {
        dev: DEV_MODE, baseWidth: 1280, performanceMode: true,
      });
      engineReady = true;
      video.addEventListener("play", function () { stage.fix(video.currentTime * 1000); stage.start(); });
      video.addEventListener("pause", function () { stage.stop(); });
      video.addEventListener("ended", function () { stage.stop(); });
      video.addEventListener("seeked", function () { stage.seek(video.currentTime * 1000); });
      console.log("[BFDanmaku] 引擎初始化完成");
    }

    var statusEl = createStatusEl();
    statusEl.textContent = "就绪";

    async function onEnableClick() {
      var btn = document.getElementById("bfdanmaku-btn");
      if (btn) { btn.disabled = true; btn.textContent = "获取弹幕中..."; }
      initEngine();

      try {
        statusEl.textContent = "正在遍历弹幕池...";
        var allDms = await fetchAllDanmakus(resourceId, "douga", function (count, pos) {
          statusEl.textContent = "已收集 " + count + " 条...";
        });

        if (allDms.length === 0) {
          statusEl.textContent = "无弹幕数据";
          if (btn) { btn.textContent = "无弹幕"; btn.disabled = false; }
          console.warn("[BFDanmaku] 弹幕池为空");
          return;
        }

        var typeStats = {};
        for (var i = 0; i < allDms.length; i++) {
          var t = allDms[i].danmakuType;
          typeStats[t] = (typeStats[t] || 0) + 1;
        }

        var loaded = pushDanmakusToPool(allDms, pool);
        var msg = "已加载 " + loaded + " 条";
        if (typeStats["7"]) msg += " 🎉含高级弹幕!";
        statusEl.textContent = msg;
        if (btn) btn.textContent = "✓ 已启用";

        console.log("[BFDanmaku] ✅ " + loaded + " 条 | " + JSON.stringify(typeStats));
      } catch (e) {
        console.error("[BFDanmaku] 错误:", e);
        statusEl.textContent = "错误: " + (e.message || e);
        if (btn) { btn.textContent = "重试"; btn.disabled = false; }
      }
    }

    var btn = createButton(onEnableClick);
    insertButton(btn, statusEl);
    console.log("[BFDanmaku] 🚀 按钮已插入");
  }

  // ==================== 启动 ====================
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();