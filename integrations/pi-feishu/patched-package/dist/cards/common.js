/** 普通文本块（支持 Markdown，tag: lark_md） */
export function textBlock(content) {
    return {
        tag: "div",
        text: {
            tag: "lark_md",
            content,
        },
    };
}
/** 灰色注释文本块（通常用于辅助信息） */
export function noteBlock(content) {
    return textBlock(`<font color="grey">${content}</font>`);
}
/**
 * 按钮：点击后飞书会触发 cardAction 事件，value 字段原样带到事件里。
 * value 里通常放 cmd（命令名）+ 相关参数（sessionKey、dialogId 等）。
 */
export function button(text, value, type = "default") {
    return {
        tag: "button",
        text: {
            tag: "plain_text",
            content: text,
        },
        type,
        value,
    };
}
/** 按钮组：把多个按钮排成一行 */
export function actions(elements) {
    return {
        tag: "action",
        actions: elements,
    };
}
/**
 * 静态下拉菜单：value 同样会随 cardAction 事件带回。
 * 第一个选项会设为 initial_option（默认选中）。
 */
export function selectMenu(placeholder, value, options) {
    const initialOption = options[0]
        ? {
            text: {
                tag: "plain_text",
                content: options[0].text,
            },
            value: options[0].value,
        }
        : undefined;
    return {
        tag: "select_static",
        placeholder: {
            tag: "plain_text",
            content: placeholder,
        },
        ...(initialOption ? { initial_option: initialOption } : {}),
        options: options.map((option) => ({
            text: {
                tag: "plain_text",
                content: option.text,
            },
            value: option.value,
        })),
        value,
    };
}
/** 组装一张完整的飞书卡片：头部（标题+颜色模板）+ 元素列表 */
export function card(title, template, elements) {
    return {
        config: {
            wide_screen_mode: true,
        },
        header: {
            title: {
                tag: "plain_text",
                content: title,
            },
            template,
        },
        elements: elements,
    };
}
//# sourceMappingURL=common.js.map