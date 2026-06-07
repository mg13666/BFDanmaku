// ==UserScript==
// @name         BFDanmaku - A站旧高级弹幕复活
// @namespace    https://github.com/mg13666/BFDanmaku
// @version      1.0.0
// @description  在A站新版播放器上叠加BFDanmaku渲染引擎，支持解析c-m格式旧高级弹幕（type=7）
// @author       mg13666 / boomfun
// @match        https://www.acfun.cn/v/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  // ==================== 配置 ====================
  const BFDanmaku_CDN =
    "https://raw.githubusercontent.com/mg13666/BFDanmaku/master/dist/BFDanmaku.js";
  const ENABLE_ACFUN_PARSER = true; // 启用c-m旧高级弹幕解析
  const DEV_MODE = true; // 开启后输出调试日志

  // ==================== 精简Color类（内联，不依赖外部导入） ====================
  // 来自 src/core/utils/color.ts，为油猴环境精简
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

  // ==================== AcfunParser 内联 ====================
  // 原文件: src/parser/acfun.js
  // 将 c-m (type=7) 弹幕数据解析为 BFDanmaku 的 DanmakuConfig 格式
  const AcfunParser = (function () {
    var parentList = {};
    var waitForParent = {};
    var waitForMask = {};

    // AnchorType 枚举（对应 src/core/static/static.ts）
    var AnchorType = {
      leftTop: 0,
      middleTop: 1,
      rightTop: 2,
      leftMiddle: 3,
      middle: 4,
      rightMiddle: 5,
      leftBottom: 6,
      middleBottom: 7,
      rightBottom: 8,
    };

    // BlendMode 映射（A站c-m -> BFDanmaku）
    function parseBlendMode(bm) {
      if ((bm >= 6 && bm <= 8) || bm >= 11) return 0;
      else if (bm > 6 && bm < 11) return bm - 3;
      else {
        if (bm === 1) return 2;
        return bm;
      }
    }

    function getContent(o) {
      if (o.w && o.w.g && o.w.g.d) {
        return { type: 1 /* base64img */, content: o.w.g.d };
      } else {
        return { type: 0 /* text */, content: o.n.replace(/\r/g, "\n") };
      }
    }

    function getConfig(o) {
      return {
        anchor: o.c !== undefined ? Number(o.c) : 0,
        zindex: o.dep ? Number(o.dep) : 0,
        filter:
          o.w !== undefined && o.w.l !== undefined
            ? parseFilter(o.w.l)
            : undefined,
        bm: o.bm !== undefined ? Number(o.bm) : 0,
        word: {
          bold: o.w !== undefined && o.w.b !== undefined ? o.w.b : false,
          stroke: o.b !== undefined ? o.b : false,
          font:
            o.w !== undefined && o.w.f !== undefined
              ? o.w.f === "微软雅黑" || o.w.f === "Microsoft YaHei"
                ? "微软雅黑"
                : o.w.f
              : undefined,
        },
      };
    }

    function parseFilter(arr) {
      var res = [];
      for (var i = 0; i < arr.length; i++) {
        var s = arr[i];
        var filter = undefined;
        switch (s[0]) {
          case 0: // 模糊滤镜
            filter = { type: 1 /* blur */, blur: s[1] };
            break;
          case 1: // 文字阴影
            filter = {
              type: 0 /* TextShadow */,
              color: BFColor.fromDEC(s[1]),
              offsetX: 0,
              offsetY: 0,
              blur: s[3],
              knockout: s[8] === true,
              onlyShadow: false,
            };
            break;
          case 2: // 带方向文字阴影
            filter = {
              type: 0 /* TextShadow */,
              color: BFColor.fromDEC(s[3]),
              offsetX: Math.cos((s[2] * Math.PI) / 180) * s[1],
              offsetY: Math.sin((s[2] * Math.PI) / 180) * s[1],
              blur: s[5],
              knockout: s[10] === true,
              onlyShadow: s[11] === true,
            };
            break;
        }
        if (filter) res.push(filter);
      }
      return res.length === 0 ? undefined : res;
    }

    function getAdvanced(o, color) {
      var re = [
        {
          opacity: o.a !== undefined ? Number(o.a) : 1,
          time: o.l !== undefined ? Number(o.l) * 1000 : 0,
          color: color,
          rotate: {
            x: o.rx !== undefined ? -o.rx : 0,
            y: o.k !== undefined ? -o.k : 0,
            z: o.r !== undefined ? Number(o.r) : 0,
          },
          point: {
            x: o.p !== undefined && o.p.x !== undefined ? Number(o.p.x) : 0,
            y: o.p !== undefined && o.p.y !== undefined ? Number(o.p.y) : 0,
            z: o.pz !== undefined ? -o.pz : 0,
          },
          scale: {
            x: o.e !== undefined ? Number(o.e) : 1,
            y: o.f !== undefined ? Number(o.f) : 1,
            z: o.sz !== undefined ? Number(o.sz) : 1,
          },
          transition: 0,
        },
      ];
      if (o.z) {
        var last = re[0];
        for (var i = 0; i < o.z.length; i++) {
          var _z = o.z[i];
          var f = {
            opacity: _z.t !== undefined ? Number(_z.t) : last.opacity,
            time: _z.l * 1000,
            color:
              _z.c !== undefined
                ? BFColor.fromDEC(Number(_z.c))
                : last.color,
            rotate: {
              z: _z.d !== undefined ? _z.d : last.rotate.z,
              y: _z.e !== undefined ? -_z.e : last.rotate.y,
              x: _z.rx !== undefined ? -_z.rx : last.rotate.x,
            },
            scale: {
              y: _z.g !== undefined ? Number(_z.g) : last.scale.y,
              x: _z.f !== undefined ? Number(_z.f) : last.scale.x,
              z: _z.sz !== undefined ? Number(_z.sz) : last.scale.z,
            },
            point: {
              x: _z.x !== undefined ? Number(_z.x) : last.point.x,
              y: _z.y !== undefined ? Number(_z.y) : last.point.y,
              z: _z.z !== undefined ? -_z.z : last.point.z,
            },
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
        // 只处理 type=7 的高级弹幕
        if (Number(c[2]) !== 7) continue;

        var id =
          "bf-o_" +
          Math.ceil(Math.random() * 10000000) +
          "_" +
          Math.ceil(Math.random() * 10000000);
        var color = BFColor.fromDEC(parseInt(c[1]));
        var advance = JSON.parse(item.m);

        // 内容
        var content = getContent(advance);
        // 基础配置
        var conf = getConfig(advance);
        // 关键帧
        var adv = getAdvanced(advance, color);

        // 构建 DanmakuConfig
        var o = {
          id: id,
          content: content.content,
          startTime: (Number(c[0]) || 0) * 1000,
          anchor:
            conf.anchor !== undefined
              ? AnchorType.hasOwnProperty(conf.anchor)
                ? AnchorType[conf.anchor]
                : conf.anchor
              : AnchorType.leftTop,
          word: {
            bold: conf.word.bold,
            stroke: conf.word.stroke,
            size: Number(c[3]) || 25,
            font: conf.word.font || "微软雅黑",
          },
          contentType: content.type,
          zindex: conf.zindex,
          filter: conf.filter,
          frames: adv,
          parent: undefined,
          bm: conf.bm !== undefined ? parseBlendMode(conf.bm) : 0,
          mask: undefined,
        };

        // 处理父子关系
        if (advance.p) {
          o.parent = advance.p;
          if (parentList[advance.p]) {
            o.parent = parentList[advance.p];
          } else {
            waitForParent[advance.p] = waitForParent[advance.p] || [];
            waitForParent[advance.p].push(o);
          }
        }
        parentList[advance.k || advance.id] = id;

        // 弹幕遮罩
        if (advance.mask) {
          if (parentList[advance.mask]) {
            o.mask = parentList[advance.mask];
          } else {
            waitForMask[advance.mask] = waitForMask[advance.mask] || [];
            waitForMask[advance.mask].push(o);
          }
        }

        res.push(o);
      }

      // 解析延迟的父子引用
      for (var key in waitForParent) {
        if (parentList[key]) {
          var children = waitForParent[key];
          for (var j = 0; j < children.length; j++) {
            children[j].parent = parentList[key];
          }
        }
      }
      for (var key2 in waitForMask) {
        if (parentList[key2]) {
          var masks = waitForMask[key2];
          for (var k = 0; k < masks.length; k++) {
            masks[k].mask = parentList[key2];
          }
        }
      }

      return res;
    }

    return parse;
  })();

  // ==================== 弹幕数据获取 ====================
  function extractResourceId() {
    var match = location.pathname.match(/ac(\d+)/);
    return match ? match[1] : null;
  }

  async function fetchDanmakuList(resourceId, resourceType) {
    var body = "resourceId=" + resourceId + "&resourceType=" + resourceType;
    var res = await fetch("/rest/pc-direct/new-danmaku/list", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body,
    });
    return res.json();
  }

  async function pollDanmakus(resourceId, resourceType, position) {
    var body =
      "resourceId=" +
      resourceId +
      "&resourceType=" +
      resourceType +
      "&position=" +
      position;
    var res = await fetch("/rest/pc-direct/new-danmaku/pollByPosition", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body,
    });
    return res.json();
  }

  // ==================== 渲染 ====================
  function createStageOverlay(container) {
    var div = document.createElement("div");
    div.id = "bfdanmaku-stage";
    div.style.cssText =
      "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;";
    // 让容器支持绝对定位
    if (
      getComputedStyle(container).position === "static"
    ) {
      container.style.position = "relative";
    }
    container.appendChild(div);
    return div;
  }

  function pushNewDanmakuToPool(danmakuData, pool) {
    if (!danmakuData || !danmakuData.danmakus) return 0;
    var count = 0;

    // 分离普通弹幕和高级弹幕
    var advancedItems = [];
    var normalItems = [];

    for (var i = 0; i < danmakuData.danmakus.length; i++) {
      var dm = danmakuData.danmakus[i];
      if (dm.danmakuType === 7) {
        advancedItems.push(dm);
      } else {
        normalItems.push(dm);
      }
    }

    // === 处理高级弹幕（type=7）通过 AcfunParser ===
    if (ENABLE_ACFUN_PARSER && advancedItems.length > 0) {
      try {
        var parsedList = AcfunParser(advancedItems);
        for (var a = 0; a < parsedList.length; a++) {
          pool.push(parsedList[a]);
          count++;
        }
        if (DEV_MODE)
          console.log(
            "[BFDanmaku] 🎬 高级弹幕解析完成: " +
              parsedList.length +
              " 条",
            parsedList
          );
      } catch (e) {
        console.error("[BFDanmaku] 高级弹幕解析失败:", e);
      }
    }

    // === 处理普通弹幕（type=0）转为 DanmakuConfig ===
    for (var n = 0; n < normalItems.length; n++) {
      var dm2 = normalItems[n];
      var color = BFColor.fromDEC(dm2.color || 0xffffff);

      // mode 映射到 anchor:
      // A站: 1=滚动, 4=底部, 5=顶部, 6=逆向滚动
      // BFDanmaku AnchorType: 0=左上...8=右下
      var anchor = 0; // 默认左上（弹幕库自己处理滚动）

      var config = {
        id: "dm-" + dm2.danmakuId,
        content: dm2.body,
        startTime: dm2.position || 0,
        anchor: anchor,
        word: {
          bold: false,
          stroke: false,
          size: dm2.size || 25,
          font: "微软雅黑",
        },
        contentType: 0, // text
        zindex: 0,
        filter: undefined,
        frames: [
          {
            opacity: 1,
            time: 10000,
            color: color,
            rotate: { x: 0, y: 0, z: 0 },
            point: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            transition: 0,
          },
        ],
        parent: undefined,
        bm: 0,
        mask: undefined,
      };
      pool.push(config);
      count++;
    }

    return count;
  }

  // ==================== 工具函数 ====================
  function waitFor(selector, timeout) {
    timeout = timeout || 30000;
    return new Promise(function (resolve, reject) {
      var el = document.querySelector(selector);
      if (el) return resolve(el);
      var observer = new MutationObserver(function () {
        var el2 = document.querySelector(selector);
        if (el2) {
          observer.disconnect();
          resolve(el2);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () {
        observer.disconnect();
        reject(new Error("等待超时: " + selector));
      }, timeout);
    });
  }

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = url;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // ==================== 主逻辑 ====================
  async function init() {
    console.log("[BFDanmaku] 启动中...");

    // 1. 等A站播放器加载
    var video, container;
    try {
      video = await waitFor("video");
      // 找播放器容器
      container =
        document.querySelector(".frame") ||
        document.querySelector(".container-video") ||
        document.querySelector(".player-container") ||
        video.parentElement;
    } catch (e) {
      console.error("[BFDanmaku] 找不到播放器:", e);
      return;
    }

    console.log(
      "[BFDanmaku] 播放器就绪, video:",
      video.videoWidth,
      "x",
      video.videoHeight
    );

    // 2. 加载BFDanmaku引擎
    try {
      await loadScript(BFDanmaku_CDN);
      console.log("[BFDanmaku] 引擎加载完成");
    } catch (e) {
      console.error("[BFDanmaku] 引擎加载失败:", e);
      return;
    }

    // 等待引擎可用
    var retries = 0;
    while (
      (!window.DanmakuPool || !window.DanmakuStage) &&
      retries < 50
    ) {
      await new Promise(function (r) {
        setTimeout(r, 200);
      });
      retries++;
    }
    if (!window.DanmakuPool || !window.DanmakuStage) {
      console.error("[BFDanmaku] 引擎未正确暴露全局变量");
      return;
    }

    // 3. 创建Canvas叠加层
    var stageDiv = createStageOverlay(container);

    // 4. 初始化弹幕池和舞台
    var videoW = video.videoWidth || 1280;
    var videoH = video.videoHeight || 720;
    if (!videoW || !videoH) {
      // video 元素可能还没解析到尺寸
      videoW = 1280;
      videoH = 720;
    }

    var pool = new window.DanmakuPool();
    var stage = new window.DanmakuStage(stageDiv, pool, videoW, videoH, {
      dev: DEV_MODE,
      baseWidth: 1280,
      performanceMode: true,
    });

    // 5. 获取resourceId并加载弹幕
    var resourceId = extractResourceId();
    if (!resourceId) {
      console.error("[BFDanmaku] 无法从URL提取resourceId");
      return;
    }
    console.log("[BFDanmaku] resourceId:", resourceId);

    // 加载弹幕列表
    try {
      var listData = await fetchDanmakuList(resourceId, "douga");
      if (listData.result === 0 && listData.danmakus) {
        var loaded = pushNewDanmakuToPool(listData, pool);
        console.log(
          "[BFDanmaku] ✅ 初始加载 " + loaded + " 条弹幕 (总计 " + listData.danmakus.length + " 条)"
        );

        // 统计类型分布
        var typeStats = {};
        for (var i = 0; i < listData.danmakus.length; i++) {
          var t = listData.danmakus[i].danmakuType;
          typeStats[t] = (typeStats[t] || 0) + 1;
        }
        console.log(
          "[BFDanmaku] 弹幕类型分布:",
          JSON.stringify(typeStats),
          typeStats["7"]
            ? "🎉 包含高级弹幕！"
            : "⚠️ 无type=7高级弹幕，只有普通弹幕"
        );
      } else {
        console.warn("[BFDanmaku] 弹幕列表返回异常:", listData);
      }
    } catch (e) {
      console.error("[BFDanmaku] 弹幕列表请求失败:", e);
    }

    // 6. 绑定视频事件
    video.addEventListener("play", function () {
      stage.fix(video.currentTime * 1000);
      stage.start();
    });
    video.addEventListener("pause", function () {
      stage.stop();
    });
    video.addEventListener("ended", function () {
      stage.stop();
    });
    video.addEventListener("seeked", function () {
      stage.seek(video.currentTime * 1000);
    });

    // 7. 轮询增量弹幕
    var pollTimer = null;
    function startPolling() {
      if (pollTimer) return;
      pollTimer = setInterval(async function () {
        try {
          var pos = Math.floor(video.currentTime * 1000);
          var pollData = await pollDanmakus(resourceId, "douga", pos);
          if (pollData.result === 0 && pollData.danmakus) {
            var added = pushNewDanmakuToPool(pollData, pool);
            if (added > 0 && DEV_MODE) {
              console.log(
                "[BFDanmaku] 轮询新增 " + added + " 条弹幕 @" + pos
              );
            }
          }
        } catch (e) {
          // 静默忽略轮询错误
        }
      }, 5000);
    }

    video.addEventListener("play", startPolling);
    video.addEventListener("pause", function () {
      clearInterval(pollTimer);
      pollTimer = null;
    });
    video.addEventListener("ended", function () {
      clearInterval(pollTimer);
      pollTimer = null;
    });

    console.log(
      "[BFDanmaku] 🚀 就绪！" +
        " | canvas叠加层已创建" +
        " | 弹幕列表已加载" +
        " | 事件绑定完成" +
        " | 轮询已就绪"
    );
  }

  // ==================== 启动 ====================
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
