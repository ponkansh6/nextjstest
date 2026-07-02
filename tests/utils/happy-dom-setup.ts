import { GlobalWindow } from "happy-dom";
import { setupUiMocks } from "./ui-mocks";

const window = new GlobalWindow({ url: "http://localhost" });

// @ts-ignore
global.window = window;
// @ts-ignore
global.document = window.document;
// @ts-ignore
global.navigator = window.navigator;
// @ts-ignore
global.HTMLElement = window.HTMLElement;

setupUiMocks();
