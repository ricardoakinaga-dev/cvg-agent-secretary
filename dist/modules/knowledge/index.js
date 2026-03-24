"use strict";
// Knowledge Module - RAG and Institutional Knowledge
// Phase 3: RAG and Institutional Knowledge
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeKnowledgeModule = initializeKnowledgeModule;
__exportStar(require("./types"), exports);
__exportStar(require("./repository"), exports);
__exportStar(require("./retrieval"), exports);
__exportStar(require("./tools"), exports);
// Initialize the knowledge retrieval service
const retrieval_1 = require("./retrieval");
async function initializeKnowledgeModule() {
    await retrieval_1.knowledgeRetrievalService.initialize();
}
//# sourceMappingURL=index.js.map