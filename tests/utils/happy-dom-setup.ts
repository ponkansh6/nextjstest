import { JSDOM } from 'happy-dom';
import { setupUiMocks } from './ui-mocks';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
});

// @ts-ignore
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;

setupUiMocks();
