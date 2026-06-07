// ==UserScript==
// @name         BFDanmaku - A站旧高级弹幕复活
// @namespace    https://github.com/mg13666/BFDanmaku
// @version      1.0.1
// @description  在A站新版播放器上叠加BFDanmaku渲染引擎，支持解析c-m格式旧高级弹幕（type=7）
// @author       mg13666 / boomfun
// @match        https://www.acfun.cn/v/*
// @require      https://raw.githubusercontent.com/mg13666/BFDanmaku/master/dist/BFDanmaku.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  // ==================== 配置 ====================
  const ENABLE_ACFUN_PARSER = true;
  const DEV_MODE = true;

  // ==================== 精简Color类 ====================
  const BFColor = (function () {
    function Color(r, g, b, a) {
      this.r = r !== undefined ? r : 255;
      this.g = g !== undefined ? g : 255;
      this.b = b !== undefined ? b : 255;
      this.a = a !== undefined ? a : 255;
    }
    Color.fromHEX = function (hexstr) {
      hexstr = hexstr.replace("#", "");
      var d = hexstr.length;
      for (var i = 0; i < 6 - d; i++) hexstr = "0" + hexstr;
      if (hexstr.length === 7) hexstr = "0" + hexstr;
      return new Color(
        parseInt("0x" + hexstr[0] + hexstr[1]),
        parseInt("0x" + hexstr[2] + hexstr[3]),
        parseInt("0x" + hexstr[4] + hexstr[5]),
        hexstr[6] !== undefined
          ? parseInt("0x" + hexstr[6] + hexstr[7])
          : 255
      );
    };
    Color.fromDEC = function (d) {
      return Color.fromHEX(d.toString(16));
    };
    Color.fromRGB = Color;
    return Color;
  })();

  // ==================== AcfunParser ====================
  const AcfunParser = (function () {
    var parentList = {};
    var waitForParent = {};
    var waitForMask = {};

    var AnchorType = {
      leftTop: 0, middleTop: 1, rightTop: 2,
      leftMiddle: 3, middle: 4, rightMiddle: 5,
      leftBottom: 6, middleBottom: 7, rightBottom: 8,
    };

    function parseBlendMode(bm) {
      if ((bm >= 6 && bm <= 8) || bm >= 11) return 0;
      else if (bm > 6 && bm < 11) return bm - 3;
      else { if (bm === 1) return 2; return bm; }
    }

    function getContent(o) {
      if (o.w && o.w.g && o.w.g.d)
        return { type: 1, content: o.w.g.d };
      else
        return { type: 0, content: o.n.replace(/\r/g, "\n") };
    }

    function getConfig(o) {
      return {
        anchor: o.c !== undefined ? Number(o.c) : 0,
        zindex: o.dep ? Number(o.dep) : 0,
        filter: o.w !== undefined && o.w.l !== undefined ? parseFilter(o.w.l) : undefined,
        bm: o.bm !== undefined ? Number(o.bm) : 0,
        word: {
          bold: o.w !== undefined && o.w.b !== undefined ? o.w.b : false,
          stroke: o.b !== undefined ? o.b : false,
          font: o.w !== undefined && o.w.f !== undefined
            ? (o.w.f === "微软雅黑" || o.w.f === "Microsoft YaHei" ? "微软雅黑" : o.w.f)
            : undefined,
        },
      };
    }

    function parseFilter(arr) {
      var res = [];
      for (var i = 0; i < arr.length; i++) {
        var s = arr[i], filter = undefined;
        switch (s[0]) {
          case 0:
            filter = { type: 1, blur: s[1] };
            break;
          case 1:
            filter = { type: 0, color: BFColor.fromDEC(s[1]), offsetX: 0, offsetY: 0, blur: s[3], knockout: s[8] === true, onlyShadow: false };
            break;
          case 2:
            filter = { type: 0, color: BFColor.fromDEC(s[3]), offsetX: Math.cos((s[2] * Math.PI) / 180) * s[1], offsetY: Math.sin((s[2] * Math.PI) / 180) * s[1], blur: s[5], knockout: s[10] === true, onlyShadow: s[11] === true };
            break;
        }
        if (filter) res.push(filter);
      }
      return res.length === 0 ? undefined : res;
    }

    function getAdvanced(o, color) {
      var re = [{
        opacity: o.a !== undefined ? Number(o.a) : 1,
        time: o.l !== undefined ? Number(o.l) * 1000 : 0,
        color: color,
        rotate: { x: o.rx !== undefined ? -o.rx : 0, y: o.k !== undefined ? -o.k : 0, z: o.r !== undefined ? Number(o.r) : 0 },
        point: { x: o.p !== undefined && o.p.x !== undefined ? Number(o.p.x) : 0, y: o.p !== undefined && o.p.y !== undefined ? Number(o.p.y) : 0, z: o.pz !== undefined ? -o.pz : 0 },
        scale: { x: o.e !== undefined ? Number(o.e) : 1, y: o.f !== undefined ? Number(o.f) : 1, z: o.sz !== undefined ? Number(o.sz) : 1 },
        transition: 0,
      }];
      if (o.z) {
        var last = re[0];
        for (var i = 0; i < o.z.length; i++) {
          var _z = o.z[i];
          var f = {
            opacity: _z.t !== undefined ? Number(_z.t) : last.opacity,
            time: _z.l * 1000,
            color: _z.c !== undefined ? BFColor.fromDEC(Number(_z.c)) : last.color,
            rotate: { z: _z.d !== undefined ? _z.d : last.rotate.z, y: _z.e !== undefined ? -_z.e : last.rotate.y, x: _z.rx !== undefined ? -_z.rx : last.rotate.x },
            scale: { y: _z.g !== undefined ? Number(_z.g) : last.scale.y, x: _z.f !== undefined ? Number(_z.f) : last.scale.x, z: _z.sz !== undefined ? Number(_z.sz) : last.scale.z },
            point: { x: _z.x !== undefined ? Number(_z.x) : last.point.x, y: _z.y !== undefined ? Number(_z.y) : last.point.y, z: _z.z !== undefined ? -_z.z : last.point.z },
            transition: _z.v !== undefined ? Number(_z.v) : 1,
          };
          re.push(f);
          last = f;
        }
      }
      return re;
    }

    function parse(data) {
      parentList = {};
      var res = [];
      for (var i = 0; i < data.length; i++) {
        var item = data[i];
        var c = item.c.split(",");
        if (Number(c[2]) !== 7) continue;

        var id = "bf-o_" + Math.ceil(Math.random() * 10000000) + "_" + Math.ceil(Math.random() * 10000000);
        var color = BFColor.fromDEC(parseInt(c[1]));
        var advance = JSON.parse(item.m);
        var content = getContent(advance);
        var conf = getConfig(advance);
        var adv = getAdvanced(advance, color);

        var o = {
          id: id,
          content: content.content,
          startTime: (Number(c[0]) || 0) * 1000,
          anchor: conf.anchor !== undefined
            ? (AnchorType.hasOwnProperty(conf.anchor) ? AnchorType[conf.anchor] : conf.anchor)
            : AnchorType.leftTop,
          word: { bold: conf.word.bold, stroke: conf.word.stroke, size: Number(c[3]) || 25, font: conf.word.font || "微软雅黑" },
          contentType: content.type,
          zindex: conf.zindex,
          filter: conf.filter,
          frames: adv,
          parent: undefined,
          bm: conf.bm !== undefined ? parseBlendMode(conf.bm) : 0,
          mask: undefined,
        };

        if (advance.p) {
          o.parent = advance.p;
          if (parentList[advance.p]) { o.parent = parentList[advance.p]; }
          else { waitForParent[advance.p] = waitForParent[advance.p] || []; waitForParent[advance.p].push(o); }
        }
        parentList[advance.k || advance.id] = id;

        if (advance.mask) {
          if (parentList[advance.mask]) { o.mask = parentList[advance.mask]; }
          else { waitForMask[advance.mask] = waitForMask[advance.mask] || []; waitForMask[advance.mask].push(o); }
        }

        res.push(o);
      }

      for (var key in waitForParent) {
        if (parentList[key]) {
          var children = waitForParent[key];
          for (var j = 0; j < children.length; j++) children[j].parent = parentList[key];
        }
      }
      for (var key2 in waitForMask) {
        if (parentList[key2]) {
          var masks = waitForMask[key2];
          for (var k = 0; k < masks.length; k++) masks[k].mask = parentList[key2];
        }
      }

      return res;
    }

    return parse;
  })();

  // ==================== 数据获取 ====================
  function extractResourceId() {
    var m = location.pathname.match(/ac(\d+)/);
    return m ? m[1] : null;
  }

  async function fetchDanmakuList(resourceId, resourceType) {
    var res = await fetch("/rest/pc-direct/new-danmaku/list", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "resourceId=" + resourceId + "&resourceType=" + resourceType,
    });
    return res.json();
  }

  async function pollDanmakus(resourceId, resourceType, position) {
    var res = await fetch("/rest/pc-direct/new-danmaku/pollByPosition", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "resourceId=" + resourceId + "&resourceType=" + resourceType + "&position=" + position,
    });
    return res.json();
  }

  // ==================== 渲染辅助 ====================
  function createStageOverlay(container) {
    var div = document.createElement("div");
    div.id = "bfdanmaku-stage";
    div.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;";
    if (getComputedStyle(container).position === "static") container.style.position = "relative";
    container.appendChild(div);
    return div;
  }

  function pushDanmakusToPool(danmakuData, pool) {
    if (!danmakuData || !danmakuData.danmakus) return 0;
    var count = 0;
    var advancedItems = [];
    var normalItems = [];

    for (var i = 0; i < danmakuData.danmakus.length; i++) {
      var dm = danmakuData.danmakus[i];
      if (dm.danmakuType === 7) advancedItems.push(dm);
      else normalItems.push(dm);
    }

    // 高级弹幕通过 AcfunParser
    if (ENABLE_ACFUN_PARSER && advancedItems.length > 0) {
      try {
        var parsed = AcfunParser(advancedItems);
        for (var a = 0; a < parsed.length; a++) { pool.push(parsed[a]); count++; }
        if (DEV_MODE) console.log("[BFDanmaku] 🎬 高级弹幕: " + parsed.length + " 条", parsed);
      } catch (e) { console.error("[BFDanmaku] 解析失败:", e); }
    }

    // 普通弹幕
    for (var n = 0; n < normalItems.length; n++) {
      var dm2 = normalItems[n];
      var color = BFColor.fromDEC(dm2.color || 0xffffff);
      pool.push({
        id: "dm-" + dm2.danmakuId,
        content: dm2.body,
        startTime: dm2.position || 0,
        anchor: 0,
        word: { bold: false, stroke: false, size: dm2.size || 25, font: "微软雅黑" },
        contentType: 0,
        zindex: 0,
        filter: undefined,
        frames: [{ opacity: 1, time: 10000, color: color, rotate: { x: 0, y: 0, z: 0 }, point: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, transition: 0 }],
        parent: undefined,
        bm: 0,
        mask: undefined,
      });
      count++;
    }
    return count;
  }

  // ==================== 工具 ====================
  function waitFor(selector, timeout) {
    timeout = timeout || 30000;
    return new Promise(function (resolve, reject) {
      var el = document.querySelector(selector);
      if (el) return resolve(el);
      var ob = new MutationObserver(function () {
        var e2 = document.querySelector(selector);
        if (e2) { ob.disconnect(); resolve(e2); }
      });
      ob.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { ob.disconnect(); reject(new Error("超时: " + selector)); }, timeout);
    });
  }

  // ==================== 主逻辑 ====================
  async function init() {
    console.log("[BFDanmaku] 启动...");

    // 等引擎
    var retries = 0;
    while ((!window.DanmakuPool || !window.DanmakuStage) && retries < 100) {
      await new Promise(function (r) { setTimeout(r, 200); });
      retries++;
    }
    if (!window.DanmakuPool || !window.DanmakuStage) {
      console.error("[BFDanmaku] 引擎加载失败");
      return;
    }
    console.log("[BFDanmaku] 引擎就绪");

    // 等播放器
    var video;
    try { video = await waitFor("video"); }
    catch (e) { console.error("[BFDanmaku] 无播放器:", e); return; }

    var container =
      document.querySelector(".frame") ||
      document.querySelector(".container-video") ||
      document.querySelector(".player-container") ||
      video.parentElement;

    console.log("[BFDanmaku] 播放器就绪, " + video.videoWidth + "x" + video.videoHeight);

    // 创建舞台
    var stageDiv = createStageOverlay(container);
    var vw = video.videoWidth || 1280;
    var vh = video.videoHeight || 720;
    var pool = new window.DanmakuPool();
    var stage = new window.DanmakuStage(stageDiv, pool, vw, vh, {
      dev: DEV_MODE,
      baseWidth: 1280,
      performanceMode: true,
    });

    // 获取弹幕
    var resourceId = extractResourceId();
    if (!resourceId) { console.error("[BFDanmaku] 无法获取resourceId"); return; }
    console.log("[BFDanmaku] resourceId:", resourceId);

    try {
      var listData = await fetchDanmakuList(resourceId, "douga");
      if (listData.result === 0 && listData.danmakus) {
        var loaded = pushDanmakusToPool(listData, pool);

        var typeStats = {};
        for (var i = 0; i < listData.danmakus.length; i++) {
          var t = listData.danmakus[i].danmakuType;
          typeStats[t] = (typeStats[t] || 0) + 1;
        }
        console.log(
          "[BFDanmaku] ✅ 加载 " + loaded + " 条 | 类型分布: " + JSON.stringify(typeStats) +
          (typeStats["7"] ? " 🎉" : " ⚠️无高级弹幕")
        );
      } else {
        console.warn("[BFDanmaku] 异常:", listData);
      }
    } catch (e) { console.error("[BFDanmaku] 失败:", e); }

    // 事件绑定
    video.addEventListener("play", function () {
      stage.fix(video.currentTime * 1000);
      stage.start();
    });
    video.addEventListener("pause", function () { stage.stop(); });
    video.addEventListener("ended", function () { stage.stop(); });
    video.addEventListener("seeked", function () { stage.seek(video.currentTime * 1000); });

    // 轮询
    var pollTimer = null;
    function startPoll() {
      if (pollTimer) return;
      pollTimer = setInterval(async function () {
        try {
          var pos = Math.floor(video.currentTime * 1000);
          var pollData = await pollDanmakus(resourceId, "douga", pos);
          if (pollData.result === 0 && pollData.danmakus) {
            var added = pushDanmakusToPool(pollData, pool);
            if (added > 0 && DEV_MODE) console.log("[BFDanmaku] +" + added + " @" + pos);
          }
        } catch (e) {}
      }, 5000);
    }
    video.addEventListener("play", startPoll);
    video.addEventListener("pause", function () { clearInterval(pollTimer); pollTimer = null; });
    video.addEventListener("ended", function () { clearInterval(pollTimer); pollTimer = null; });

    console.log("[BFDanmaku] 🚀 就绪！");
  }

  // ==================== 启动 ====================
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
