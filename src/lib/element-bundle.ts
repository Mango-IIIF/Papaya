/*
 * Entry for the standalone `mango-story-element.js` bundle. The viewer's
 * stylesheet is pulled in here, not in `element.ts`, so the npm build does not
 * ship a second copy of it inside `story.css`.
 */
import '@mango-iiif/iiif-viewer/style.css';
import './element';
