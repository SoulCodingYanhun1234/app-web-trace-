import { onMounted, onUnmounted, watch, type Ref } from 'vue';

export interface WatermarkOptions {
  text: Ref<string> | string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  opacity?: number;
  rotate?: number;
  zIndex?: number;
  gapX?: number;
  gapY?: number;
}

export function useWatermark(options: WatermarkOptions) {
  const {
    text,
    fontSize = 16,
    fontFamily = 'sans-serif',
    color = '#000',
    opacity = 0.08,
    rotate = -20,
    zIndex = 9999,
    gapX = 200,
    gapY = 150,
  } = options;

  let watermarkElement: HTMLDivElement | null = null;
  // 分两个观察者：body 只需关心水印节点是否被移除，水印节点自身只需关心 style/class 是否被篡改。
  // 避免对整棵 body 子树做 subtree 深度监听，公开页面上任何无关 DOM 变化都会触发一次重绘。
  let bodyObserver: MutationObserver | null = null;
  let elementObserver: MutationObserver | null = null;

  const createWatermark = (watermarkText: string) => {
    if (!watermarkText) return null;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const ratio = window.devicePixelRatio || 1;
    // tileWidth/tileHeight 是 CSS 像素下的逻辑尺寸；canvas 按 devicePixelRatio 放大绘制以保持清晰度，
    // 但作为 background-image 使用时必须显式声明 background-size 还原为逻辑尺寸，否则高分屏下贴图会被放大 2~3 倍。
    const tileWidth = watermarkText.length * fontSize + gapX;
    const tileHeight = fontSize * 3 + gapY;

    canvas.width = tileWidth * ratio;
    canvas.height = tileHeight * ratio;

    ctx.scale(ratio, ratio);
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillStyle = color;
    ctx.globalAlpha = opacity;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.save();
    ctx.translate(tileWidth / 2, tileHeight / 2);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.fillText(watermarkText, 0, 0);
    ctx.restore();

    return { dataUrl: canvas.toDataURL(), tileWidth, tileHeight };
  };

  const watermarkStyle = (dataUrl: string, tileWidth: number, tileHeight: number) => `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: ${zIndex};
    pointer-events: none;
    background-image: url(${dataUrl});
    background-repeat: repeat;
    background-position: 0 0;
    background-size: ${tileWidth}px ${tileHeight}px;
    animation: watermark-slide 20s linear infinite;
  `;

  const renderWatermark = (watermarkText: string) => {
    removeWatermark();

    const tile = createWatermark(watermarkText);
    if (!tile) return;
    const { dataUrl, tileWidth, tileHeight } = tile;

    watermarkElement = document.createElement('div');
    watermarkElement.className = 'app-watermark';
    watermarkElement.style.cssText = watermarkStyle(dataUrl, tileWidth, tileHeight);

    // 添加动画样式
    if (!document.getElementById('watermark-animation-style')) {
      const style = document.createElement('style');
      style.id = 'watermark-animation-style';
      style.textContent = `
        @keyframes watermark-slide {
          0% {
            background-position: 0 0;
          }
          100% {
            background-position: ${gapX}px ${gapY}px;
          }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(watermarkElement);

    bodyObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== 'childList') continue;
        const removed = Array.from(mutation.removedNodes).includes(watermarkElement as Node);
        if (removed && watermarkElement) {
          document.body.appendChild(watermarkElement);
        }
      }
    });
    bodyObserver.observe(document.body, { childList: true });

    elementObserver = new MutationObserver(() => {
      if (!watermarkElement) return;
      // 重置自身也是一次属性变更；先断开再写回，避免自己触发自己形成死循环。
      elementObserver?.disconnect();
      watermarkElement.style.cssText = watermarkStyle(dataUrl, tileWidth, tileHeight);
      elementObserver?.observe(watermarkElement, { attributes: true, attributeFilter: ['style', 'class'] });
    });
    elementObserver.observe(watermarkElement, { attributes: true, attributeFilter: ['style', 'class'] });
  };

  const removeWatermark = () => {
    if (watermarkElement && watermarkElement.parentNode) {
      watermarkElement.parentNode.removeChild(watermarkElement);
      watermarkElement = null;
    }
    bodyObserver?.disconnect();
    bodyObserver = null;
    elementObserver?.disconnect();
    elementObserver = null;
  };

  const updateWatermark = () => {
    const watermarkText = typeof text === 'string' ? text : text.value;
    if (watermarkText) {
      renderWatermark(watermarkText);
    } else {
      removeWatermark();
    }
  };

  onMounted(() => {
    updateWatermark();

    if (typeof text !== 'string') {
      watch(text, updateWatermark);
    }
  });

  onUnmounted(() => {
    removeWatermark();
  });

  return {
    update: updateWatermark,
    remove: removeWatermark,
  };
}
