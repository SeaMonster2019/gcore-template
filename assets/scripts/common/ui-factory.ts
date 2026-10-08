import {
    Button, Color, Component, Graphics, HorizontalTextAlignment, Label, Layout,
    Mask, Node, Rect, ScrollView, Size, Sprite, UIOpacity, UITransform, VerticalTextAlignment,
    Widget,
} from "cc";

/** 设计分辨率 */
export const DESIGN_W = 750;
export const DESIGN_H = 1334;

/** 主题色板（赛博暖炉：冰冷太空里唯一有光与饭香的地方） */
export const THEME = {
    bgTop: "#1b1030",
    bgBottom: "#0e0a1c",
    panel: "#241a3a",
    panelLight: "#2e2350",
    panelDark: "#160f29",
    line: "#3a2d5c",
    gold: "#ffcf6b",
    warm: "#ff9a5a",
    text: "#f3e9ff",
    textDim: "#b9a9d6",
    good: "#7be08a",
    bad: "#ff6b78",
    accent: "#7c5cff",
};

/** 十六进制色 -> Color */
export function color(hex: string, a = 255): Color {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return new Color(r, g, b, a);
}

/** 创建节点 */
export function mkNode(name: string, parent?: Node, w = 0, h = 0): Node {
    const n = new Node(name);
    if (w > 0 || h > 0) {
        const ut = n.addComponent(UITransform);
        ut.setContentSize(w, h);
    }
    if (parent) parent.addChild(n);
    return n;
}

/** 添加 Widget 全拉伸 */
export function stretch(node: Node, left = 0, right = 0, top = 0, bottom = 0): Widget {
    const w = node.getComponent(Widget) || node.addComponent(Widget);
    w.isAbsoluteLeft = w.isAbsoluteRight = w.isAbsoluteTop = w.isAbsoluteBottom = true;
    w.isAlignLeft = w.isAlignRight = w.isAlignTop = w.isAlignBottom = true;
    w.left = left; w.right = right; w.top = top; w.bottom = bottom;
    w.updateAlignment();
    return w;
}

/** 圆角矩形背景面板（Graphics 绘制，无需贴图） */
export function mkPanel(parent: Node, w: number, h: number, opts: {
    fill?: string; stroke?: string; radius?: number; alpha?: number; lineWidth?: number;
} = {}): Node {
    const node = mkNode("panel", parent, w, h);
    const g = node.addComponent(Graphics);
    const fill = opts.fill ? color(opts.fill, opts.alpha ?? 255) : color(THEME.panel, 255);
    const r = opts.radius ?? 16;
    g.fillColor = fill;
    g.roundRect(-w / 2, -h / 2, w, h, r);
    g.fill();
    if (opts.stroke) {
        g.lineWidth = opts.lineWidth ?? 2;
        g.strokeColor = color(opts.stroke, 255);
        g.roundRect(-w / 2, -h / 2, w, h, r);
        g.stroke();
    }
    return node;
}

/** 文本标签 */
export function mkLabel(parent: Node, text: string, opts: {
    size?: number; color?: string; width?: number; align?: "left" | "center" | "right";
    vAlign?: "top" | "center" | "bottom"; bold?: boolean; wrap?: boolean;
} = {}): Label {
    const node = mkNode("label", parent);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = opts.size ?? 24;
    label.lineHeight = (opts.size ?? 24) * 1.15;
    label.color = color(opts.color ?? THEME.text);
    label.horizontalAlign = opts.align === "left" ? HorizontalTextAlignment.LEFT :
        opts.align === "right" ? HorizontalTextAlignment.RIGHT : HorizontalTextAlignment.CENTER;
    label.verticalAlign = opts.vAlign === "top" ? VerticalTextAlignment.TOP :
        opts.vAlign === "bottom" ? VerticalTextAlignment.BOTTOM : VerticalTextAlignment.CENTER;
    label.isBold = opts.bold ?? false;
    if (opts.width) {
        const ut = node.getComponent(UITransform) || node.addComponent(UITransform);
        ut.setContentSize(opts.width, label.lineHeight);
        label.overflow = Label.Overflow.RESIZE_HEIGHT;
        label.enableWrapText = opts.wrap ?? true;
    }
    return label;
}

/** 按钮（容器 + 图形背景 + 标签 + Button 组件） */
export interface IButton {
    node: Node;
    label: Label;
    setEnabled(on: boolean): void;
}
export function mkButton(parent: Node, w: number, h: number, text: string, onClick: () => void, opts: {
    fill?: string; textColor?: string; size?: number; radius?: number;
} = {}): IButton {
    const node = mkNode("btn", parent, w, h);
    const g = node.addComponent(Graphics);
    const draw = (c: Color) => {
        g.clear();
        g.fillColor = c;
        g.roundRect(-w / 2, -h / 2, w, h, opts.radius ?? 12);
        g.fill();
    };
    draw(color(opts.fill ?? THEME.accent));
    const label = mkLabel(node, text, { size: opts.size ?? 26, color: opts.textColor ?? "#ffffff" });
    const btn = node.addComponent(Button);
    btn.transition = Button.Transition.NONE;
    btn.target = node;
    node.on(Button.EventType.CLICK, () => {
        draw(color(opts.fill ?? THEME.accent));
        onClick();
    });
    const setEnabled = (on: boolean) => {
        btn.interactable = on;
        let uiOpacity = node.getComponent(UIOpacity);
        if (!uiOpacity) uiOpacity = node.addComponent(UIOpacity);
        uiOpacity.opacity = on ? 255 : 120;
    };
    return { node, label, setEnabled };
}

/** 圆形/方形头像占位（按主色画圆 + 首字） */
export function mkAvatar(parent: Node, size: number, mainColor: string, text: string): Node {
    const node = mkNode("avatar", parent, size, size);
    const g = node.addComponent(Graphics);
    g.fillColor = color(mainColor);
    g.circle(0, 0, size / 2);
    g.fill();
    g.lineWidth = 3;
    g.strokeColor = color("#ffffff", 180);
    g.circle(0, 0, size / 2 - 2);
    g.stroke();
    const label = mkLabel(node, text, { size: size * 0.42, color: "#1a1020", bold: true });
    return node;
}

/** 可滚动列表容器（ScrollView + Mask + Layout） */
export interface IScroll {
    scroll: Node;
    content: Node;
}
export function mkScroll(parent: Node, w: number, h: number): IScroll {
    const scroll = mkNode("scroll", parent, w, h);
    const mask = scroll.addComponent(Mask);
    // 0 = RECT（矩形遮罩）；运行期有效，此处用 any 规避引擎 d.ts 枚举声明差异
    (mask as any).type = 0;
    const sv = scroll.addComponent(ScrollView);
    sv.horizontal = false;
    sv.vertical = true;
    sv.inertia = true;
    const content = mkNode("content", scroll, w, h);
    const layout = content.addComponent(Layout);
    layout.type = Layout.Type.VERTICAL;
    layout.spacingY = 12;
    layout.paddingTop = 12; layout.paddingBottom = 12;
    layout.paddingLeft = 12; layout.paddingRight = 12;
    layout.resizeMode = Layout.ResizeMode.CONTAINER;
    sv.content = content;
    const cut = scroll.getComponent(UITransform)!;
    cut.setContentSize(w, h);
    return { scroll, content };
}

/** 清空节点的全部子节点 */
export function clearChildren(node: Node): void {
    for (const c of node.children.slice()) {
        c.destroy();
    }
}

/** 顶部标题条 */
export function mkTitleBar(parent: Node, title: string, onClose?: () => void): void {
    const bar = mkPanel(parent, DESIGN_W - 60, 72, { fill: THEME.panelLight, radius: 14 });
    bar.setPosition(0, DESIGN_H / 2 - 80);
    mkLabel(bar, title, { size: 32, color: THEME.gold, bold: true });
    if (onClose) {
        const close = mkButton(bar, 56, 56, "✕", onClose, { fill: THEME.bad, size: 28, radius: 28 });
        close.node.setPosition(DESIGN_W / 2 - 60 - 40, 0);
    }
}
