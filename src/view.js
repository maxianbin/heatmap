"use strict";

import {CONSTANT as CONST, globalConfig} from './config';
import utils from './utils';

/**
 * 展示对象 操作canvas展示
 * 描述: 因为每一个热图都是独立的canvas进行展示, view变身api通过apply, call来进行调用.
 */
var view = {
    // 调色板
    getColorPalette: function () {
        var gradientConfig = this.opt.gradient || globalConfig.gradient;
        var paletteCanvas = document.createElement('canvas');
        var paletteCtx = paletteCanvas.getContext('2d');

        paletteCanvas.width = 256;
        paletteCanvas.height = 1;

        var gradient = paletteCtx.createLinearGradient(0, 0, 256, 1);
        for (var key in gradientConfig) {
            gradient.addColorStop(key, gradientConfig[key]);
        }

        paletteCtx.fillStyle = gradient;
        paletteCtx.fillRect(0, 0, 256, 1);

        return paletteCtx.getImageData(0, 0, 256, 1).data;
    },
    // 节点模板
    getNodeTemplate: function (radius, blurFactor) {
        var tplCanvas = document.createElement('canvas');
        var tplCtx = tplCanvas.getContext('2d');
        var x = radius;
        var y = radius;
        tplCanvas.width = tplCanvas.height = radius * 2;

        if (blurFactor == 1) {
            tplCtx.beginPath();
            tplCtx.arc(x, y, radius, 0, 2 * Math.PI, false);
            tplCtx.fillStyle = 'rgba(0,0,0,1)';
            tplCtx.fill();
        } else {
            var gradient = tplCtx.createRadialGradient(x, y, radius * blurFactor, x, y, radius);
            gradient.addColorStop(0, 'rgba(0,0,0,1)');
            gradient.addColorStop(1, 'rgba(0,0,0,0)');
            tplCtx.fillStyle = gradient;
            tplCtx.fillRect(0, 0, 2 * radius, 2 * radius);
        }
        return tplCanvas;
    },
    // 注意力模板
    getAttentionTemplate: function(width, height) {
        var tplCanvas = document.createElement('canvas');
        var tplCtx = tplCanvas.getContext('2d');
        tplCanvas.width = width;
        tplCanvas.height = height;
        var midW = Math.round(width / 2),
            midH = Math.round(height / 2);
        // 中间 到 上
        var gradient1 = tplCtx.createLinearGradient(midW, midH, midW, 0);
        gradient1.addColorStop(0, 'rgba(0,0,0,1)');
        gradient1.addColorStop(1, 'rgba(0,0,0,0)');
        tplCtx.fillStyle = gradient1;
        tplCtx.fillRect(0, 0, width, midH);
        // 中间 到 下
        var gradient2 = tplCtx.createLinearGradient(midW, midH, midW, height);
        gradient2.addColorStop(0, 'rgba(0,0,0,1)');
        gradient2.addColorStop(1, 'rgba(0,0,0,0)');
        tplCtx.fillStyle = gradient2;
        tplCtx.fillRect(0, midH, width, midH);
        return tplCanvas;
    },
    // 节点上色
    colorize: function (ctx) {
        var colorPalette = this.colorPalette;
        // 取得图像
        var img = this.shadowCtx.getImageData(0, 0, this.shadowCanvas.width, this.shadowCanvas.height);
        var imgData = img.data;
        var len = imgData.length;
        // 上色
        for (var i = 3; i < len; i += 4) {
            var alpha = imgData[i];
            /**
             * offset = alpha * 4
             * 是因为canvas中图像是Uint8ClampedArray数组
             * 每个像素由数组中连续排列的4个数组值组成, 分别代表rgba
             */
            var offset = alpha * 4;
            if (offset) {
                imgData[i - 3] = colorPalette[offset];      // red
                imgData[i - 2] = colorPalette[offset + 1];  // green
                imgData[i - 1] = colorPalette[offset + 2];  // blue
                imgData[i] = alpha;                         // alpha
            }
        }
        ctx.putImageData(img, 0, 0);
    },
    // 清除
    clear: function () {
        this.shadowCtx.clearRect(0, 0, this.shadowCanvas.width, this.shadowCanvas.height);
        // 清除所有分屏
        this.splitScreen.forEach(function(v) {
            v.ctx.clearRect(0, 0, v.canvas.width, v.canvas.height);
        });
    },
    // 批量渲染
    renderBatch: function() {
        var self = this;
        this.splitScreen.forEach(function(v, i) {
            var dataLimit = self.getDataLimit(i + 1, self.opt.pagination.pageSize);
            view.render.call(self, dataLimit.nodes, dataLimit.attention, v.ctx);
        });
    },
    // 渲染
    render: function (nodes, attention, ctx) {
        var tpl, self = this,
            shadowCanvas = this.shadowCanvas,
            shadowCtx = this.shadowCtx,
            nodeBlur = this.opt.nodeBlur;
        nodes = nodes || this.data.nodes;
        attention = attention || this.data.attention;
        // 清除画布
        shadowCtx.clearRect(0, 0, shadowCanvas.width, shadowCanvas.height);
        shadowCtx.globalAlpha = 1;
        // 点击热图
        if (Array.isArray(nodes) && nodes.length > 0) {
            nodes.forEach(function(node) {
                // 缓存模板
                if (!self._templates[node.radius]) {
                    self._templates[node.radius] = tpl = view.getNodeTemplate(node.radius, nodeBlur);
                } else {
                    tpl = self._templates[node.radius];
                }
                // 设置透明度
                shadowCtx.globalAlpha = node.alpha;
                // 绘制节点
                shadowCtx.drawImage(tpl, node.x - node.radius, node.y - node.radius);
            });
            // 给节点上色
            view.colorize.call(this, ctx);
        }
        // 注意力热图
        if (Array.isArray(attention) && attention.length > 0) {
            attention.forEach(function(node) {
                // 缓存模板
                if (!self._attentionTemplates[node.height]) {
                    self._attentionTemplates[node.height] = tpl =
                        view.getAttentionTemplate(self.opt.maxWidth, node.height);
                } else {
                    tpl = self._attentionTemplates[node.height];
                }
                shadowCtx.globalAlpha = node.alpha;
                shadowCtx.drawImage(tpl, 0, node.y);
            });
            view.colorize.call(this, ctx);
        }
    },
    // 初始化
    init: function () {
        this.shadowCanvas = document.createElement('canvas');
        this.shadowCtx = this.shadowCanvas.getContext('2d');
        this.colorPalette = view.getColorPalette.call(this);
        this._templates = {};                               // 根据节点半径, 缓存节点模板
        this._attentionTemplates = {};                      // 根据节点高度, 缓存节点模板
        this.container.classList.add(CONST.HM_CONTAINER);
        // 添加分屏
        var opt = this.opt,
            pagination = opt.pagination,
            shadowCanvas = this.shadowCanvas,
            computed = utils.getComputedWH(this.container);
        // 设置宽和高
        opt.maxWidth = shadowCanvas.width = computed.width;
        // shadowCanvas.height = pagination.pageSize;
        // 总高度
        opt.maxHeight = opt.maxHeight < computed.height ? computed.height : opt.maxHeight;
        var maxPageSize = shadowCanvas.height = opt.maxHeight;
        // 只有一页的情况
        var canvas;
        if (pagination.currentPage * pagination.pageSize  > maxPageSize) {
            canvas = view.createCanvas.call(this, opt.maxWidth,
                maxPageSize, pagination.currentPage).canvas;
            this.container.appendChild(canvas);
        } else {
            // 总页数
            var maxPage = Math.floor(maxPageSize % pagination.pageSize === 0
                ? maxPageSize / pagination.pageSize
                : maxPageSize / pagination.pageSize + 1);
            // pagination.currentPage * pagination.pageSize <= maxPageSize
            while (pagination.currentPage <= maxPage) {
                // 最后一页的情况高度
                var pageSize = pagination.currentPage === maxPage
                    ? maxPageSize - (pagination.currentPage -1) * pagination.pageSize
                    : pagination.pageSize;
                canvas = view.createCanvas.call(this, opt.maxWidth,
                    pageSize, pagination.currentPage).canvas;
                this.container.appendChild(canvas);
                pagination.currentPage++;
            }
        }
    },
    createCanvas: function(width, height, page) {
        var splitScreen = this.splitScreen,
            canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.classList.add(CONST.HM_CANVAS);
        canvas.setAttribute(CONST.HM_PAGE, page);
        return splitScreen[splitScreen.length] = {
            canvas: canvas,
            ctx: canvas.getContext('2d')
        };
    }
};

export default view;