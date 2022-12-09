/** @odoo-module **/

import {
    append,
    combineAttributes,
    createElement,
    extractAttributes,
    getTag,
} from "@web/core/utils/xml";
import { toStringExpression } from "@web/views/utils";
import { toInterpolatedStringExpression, ViewCompiler } from "@web/views/view_compiler";

/**
 * @typedef {Object} DropdownDef
 * @property {Element} el
 * @property {boolean} inserted
 * @property {boolean} shouldInsert
 * @property {("dropdown" | "toggler" | "menu")[]} parts
 */

const ACTION_TYPES = ["action", "object"];
const SPECIAL_TYPES = [...ACTION_TYPES, "edit", "open", "delete", "url", "set_cover"];

export class KanbanCompiler extends ViewCompiler {
    setup() {
        this.ctx.readonly = "read_only_mode";
        this.compilers.push(
            { selector: ".oe_kanban_colorpicker", fn: this.compileColorPicker },
            { selector: "t[t-call]", fn: this.compileTCall }
        );
    }

    //-----------------------------------------------------------------------------
    // Compilers
    //-----------------------------------------------------------------------------

    /**
     * @override
     */
    compileButton(el, params) {
        /**
         * WOWL FIXME
         * For some reason, buttons in some arch have a data-something instead of just a normal attribute.
         * The new system only uses normal attributes.
         * This is an ugly small compatibility trick to fix this.
         */
        if (el.hasAttribute("data-type")) {
            for (const { name, value } of el.attributes) {
                el.setAttribute(name.replace(/^data-/, ""), value);
            }
        }

        const type = el.getAttribute("type");
        if (!SPECIAL_TYPES.includes(type)) {
            // Not a supported action type.
            return super.compileButton(el, params);
        }

        combineAttributes(el, "class", [
            "oe_kanban_action",
            `oe_kanban_action_${getTag(el, true)}`,
        ]);

        if (ACTION_TYPES.includes(type)) {
            if (!el.hasAttribute("debounce")) {
                // action buttons are debounced in kanban records
                el.setAttribute("debounce", 300);
            }
            return super.compileButton(el, params);
        }

        const nodeParams = extractAttributes(el, ["type"]);
        if (type === "set_cover") {
            const { "auto-open": autoOpen, "data-field": fieldName } = extractAttributes(el, [
                "auto-open",
                "data-field",
            ]);
            Object.assign(nodeParams, { autoOpen, fieldName });
        }
        const strParams = Object.entries(nodeParams)
            .map(([k, v]) => [k, toStringExpression(v)].join(":"))
            .join(",");
        el.setAttribute("t-on-click", `()=>this.triggerAction({${strParams}})`);

        const compiled = createElement(el.nodeName);
        for (const { name, value } of el.attributes) {
            compiled.setAttribute(name, value);
        }
        if (getTag(el, true) === "a" && !compiled.hasAttribute("href")) {
            compiled.setAttribute("href", "#");
        }
        for (const child of el.childNodes) {
            append(compiled, this.compileNode(child, params));
        }

        return compiled;
    }

    /**
     * @returns {Element}
     */
    compileColorPicker() {
        return createElement("t", { "t-call": "web.KanbanColorPicker" });
    }

    /**
     * @override
     */
    compileField(el, params) {
        let compiled;
        let isSpan = false;
        if (!el.hasAttribute("widget")) {
            isSpan = true;
            // fields without a specified widget are rendered as simple spans in kanban records
            const fieldName = el.getAttribute("name");
            compiled = createElement("span", { "t-out": `record["${fieldName}"].value` });
        } else {
            compiled = super.compileField(el, params);
            const fieldId = el.getAttribute("field_id") || el.getAttribute("name");
            compiled.setAttribute("id", `'${fieldId}_' + this.props.record.id`);
        }

        const { bold, display } = extractAttributes(el, ["bold", "display"]);
        const classNames = [];
        if (display === "right") {
            classNames.push("float-end");
        } else if (display === "full") {
            classNames.push("o_text_block");
        }
        if (bold) {
            classNames.push("o_text_bold");
        }
        if (classNames.length > 0) {
            const clsFormatted = isSpan
                ? classNames.join(" ")
                : toStringExpression(classNames.join(" "));
            compiled.setAttribute("class", clsFormatted);
        }
        const attrs = {};
        for (const attr of el.attributes) {
            attrs[attr.name] = attr.value;
        }

        if (el.hasAttribute("widget")) {
            const attrsParts = Object.entries(attrs).map(([key, value]) => {
                if (key.startsWith("t-attf-")) {
                    key = key.slice(7);
                    value = toInterpolatedStringExpression(value);
                } else if (key.startsWith("t-att-")) {
                    key = key.slice(6);
                    value = `"" + (${value})`;
                } else if (key.startsWith("t-att")) {
                    throw new Error("t-att on <field> nodes is not supported");
                } else if (!key.startsWith("t-")) {
                    value = toStringExpression(value);
                }
                return `'${key}':${value}`;
            });
            compiled.setAttribute("attrs", `{${attrsParts.join(",")}}`);
        }

        for (const attr in attrs) {
            if (attr.startsWith("t-") && !attr.startsWith("t-att")) {
                compiled.setAttribute(attr, attrs[attr]);
            }
        }

        return compiled;
    }

    /**
     * @param {Element} el
     * @param {Object} params
     * @returns {Element}
     */
    compileTCall(el, params) {
        const compiled = this.compileGenericNode(el, params);
        const tname = el.getAttribute("t-call");
        if (tname in this.templates) {
            compiled.setAttribute("t-call", `{{this.templates[${toStringExpression(tname)}]}}`);
        }
        return compiled;
    }
}
KanbanCompiler.OWL_DIRECTIVE_WHITELIST = [
    ...ViewCompiler.OWL_DIRECTIVE_WHITELIST,
    "t-name",
    "t-esc",
    "t-out",
    "t-set",
    "t-value",
    "t-if",
    "t-else",
    "t-elif",
    "t-foreach",
    "t-as",
    "t-key",
    "t-att.*",
    "t-call",
    "t-translation",
];
