import { XMLParser, XMLValidator } from "fast-xml-parser";

function localName(value) {
  return String(value || "").split(":").pop();
}

class WorkerXmlElement {
  constructor(name, attributes = {}, children = []) {
    this.nodeName = name;
    this.localName = localName(name);
    this.nodeType = 1;
    this.attributes = attributes;
    this.children = children;
    this.childNodes = children;
  }

  getAttribute(name) {
    if (Object.hasOwn(this.attributes, name)) return String(this.attributes[name] ?? "");
    const wanted = localName(name);
    const match = Object.entries(this.attributes).find(([key]) => localName(key) === wanted);
    return match ? String(match[1] ?? "") : "";
  }

  getElementsByTagName(name) {
    const result = [];
    const wanted = String(name || "");
    const visit = (node) => {
      for (const child of node.children) {
        if (child.nodeName === wanted || child.localName === wanted || wanted === "*") result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }

  getElementsByTagNameNS(_namespace, name) {
    return this.getElementsByTagName(name);
  }
}

class WorkerXmlDocument {
  constructor(root) {
    this.documentElement = root;
    this.nodeType = 9;
  }

  getElementsByTagName(name) {
    if (!this.documentElement) return [];
    const matches = [];
    if (name === "*" || name === this.documentElement.nodeName || name === this.documentElement.localName) matches.push(this.documentElement);
    return matches.concat(this.documentElement.getElementsByTagName(name));
  }

  getElementsByTagNameNS(_namespace, name) {
    return this.getElementsByTagName(name);
  }
}

function buildElements(entries) {
  const elements = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const attributes = entry && typeof entry === "object" && entry[":@"] ? entry[":@"] : {};
    for (const [name, value] of Object.entries(entry || {})) {
      if (name === ":@" || name === "#text" || name === "#cdata" || name.startsWith("?")) continue;
      const children = buildElements(Array.isArray(value) ? value : []);
      elements.push(new WorkerXmlElement(name, attributes, children));
    }
  }
  return elements;
}

export function parseXmlDocument(xmlText) {
  if (typeof xmlText !== "string" || !xmlText.trim()) throw new Error("El XML está vacío o supera el límite permitido.");
  if (/<!DOCTYPE|<!ENTITY/i.test(xmlText)) throw new Error("El XML contiene declaraciones DTD/ENTITY no admitidas por seguridad.");
  if (typeof DOMParser !== "undefined") {
    return new DOMParser().parseFromString(xmlText, "application/xml");
  }
  const validation = XMLValidator.validate(xmlText, { allowBooleanAttributes: false });
  if (validation !== true) throw new Error("No se pudo leer un XML CFDI válido.");
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "",
    removeNSPrefix: false,
    parseAttributeValue: false,
    parseTagValue: false,
    processEntities: false,
    trimValues: false,
  });
  const roots = buildElements(parser.parse(xmlText));
  if (roots.length !== 1) throw new Error("No se pudo leer un XML CFDI válido.");
  return new WorkerXmlDocument(roots[0]);
}

export const __test = { WorkerXmlDocument, WorkerXmlElement, buildElements, localName };
