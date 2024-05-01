const fetchEventSource =
  require('@microsoft/fetch-event-source').fetchEventSource;
const crypto = require('crypto');

const targetNode = document;
const config = { attributes: true, childList: true, subtree: true };

let translations = [];

const systemPrompt = `You are a translation expert in Monglian Cyrillic language. 

You will be provided English text, along with it's index in the list.
Each line of text needs a Mongolian Cyrillic translation along with the original index. 

RULES: 
  - The order of the output MUST match the order of the inputs.
  - Each output must contain the row index copied from the input
  - The output must only contain the translated text, and the row index.

Here's an example:

Input:
1|What time is it?
2|Is it hot today?

Output:
1|Цаг хэд болж байна?
2|Өнөөдөр халуун байна уу?`;

const knownTranslations = {};
const reverseTranslations = {};

let translating = false;

/**
 * Splits an array into batches of a specified size.
 *
 * @param {Array} array - The array to be split into batches.
 * @param {number} [batchSize=30] - The size of each batch. Defaults to 30.
 * @returns {Array} An array of batches, where each batch is an array of elements from the original array.
 */
function batchArray(array, batchSize = 30) {
  const batches = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
}

let callingGpt = false;

let gptUrl = '';
let gptKey = '';

chrome.storage.sync.get({ gptUrl: '', gptKey: '' }, (items) => {
  gptUrl = items.gptUrl;
  gptKey = items.gptKey;
});

/**
 * Translates the text using the Azure OpenAI GPT model.
 * This function makes asynchronous requests to the GPT API to translate the text.
 * It batches the translations and processes them in chunks.
 *
 * @returns {void}
 */
async function translate() {
  if (callingGpt) {
    window.setTimeout(() => {
      translate();
    }, 1000);
    return;
  }

  if (gptUrl === '' || gptKey === '') {
    window.setTimeout(() => {
      translate();
    }, 1000);
    console.log('Please set GPT Url and Key in the options page.');
    return;
  }

  //translate what we've got:
  if (translations.length == 0) {
    window.setTimeout(() => {
      translate();
    }, 1000);
    return;
  }

  const toTranslate = translations;
  translations = [];

  callingGpt = true;
  const batches = batchArray(toTranslate, 10);
  for (const batch of batches) {
    const userPrompt = batch.reduce((accumulator, cur, idx) => {
      return `${accumulator}\n${idx + 1}|${cur.textContent.replace(
        /\n/g,
        ' '
      )}`;
    }, '');

    let currentLine = '';
    console.log(`Calling Fetch with ${batch.length} translations...`);

    try {
      await fetchEventSource(gptUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': gptKey,
        },
        mode: 'cors',
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: userPrompt,
            },
          ],
          stream: true,
        }),
        onmessage: (event) => {
          function processMessage() {
            try {
              const [idx, text] = currentLine.split('|');
              const idxInt = parseInt(idx);
              const original = batch[idxInt - 1];

              reverseTranslations[text] = '';
              original.textContent = text;
            } catch (e) {
              console.error(e);
            } finally {
              currentLine = '';
            }
          }

          if (event.data === '[DONE]') {
            if (currentLine !== '') {
              processMessage();
            }
            console.log('DONE');
            return;
          }

          const parsed = JSON.parse(event.data);
          if (parsed.object === 'chat.completion.chunk') {
            if (parsed.choices.length > 0) {
              if (parsed.choices[0].delta.content !== undefined) {
                currentLine += parsed.choices[0].delta.content;
                if (currentLine.endsWith('\n')) {
                  processMessage();
                }
              }
            }
          }
        },
        onerror(err) {
          console.log(err);
        },
      });
    } catch (e) {
      console.error(e);
    }
  }

  callingGpt = false;
  window.setTimeout(() => {
    translate();
  }, 1000);
}

//kick off the translate loop
window.setTimeout(() => {
  translate();
}, 1000);

/**
 * Handles a DOM node by checking its parent node and performing translations if necessary.
 * @param {Node} node - The DOM node to handle.
 */
const handleNode = (node) => {
  const parentNode = node.parentNode;
  if (parentNode.nodeName === 'SCRIPT') return;
  if (parentNode.nodeName === 'STYLE') return;
  if (parentNode.nodeName === 'COMMENT') return;
  if (parentNode.nodeName === 'HEAD') return;

  const text = node.textContent;
  if (reverseTranslations[text] !== undefined) {
    //this is a translation. Leave it
  } else if (node.parentNode === translateButton) {
    //this is the translate button. Leave it
  } else {
    if (text !== null && text.trim() !== '') {
      if (knownTranslations[text.trim()] === undefined) {
        translations.push(node);
      } else {
        node.textContent = knownTranslations[text.trim()];
      }
    }
  }
};

const callback = (mutationList) => {
  for (const mutation of mutationList) {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach((node) => {
        if (node.parentNode !== null) {
          if (node.nodeName === '#text') {
            handleNode(node);
          }
        }
      });
    }
  }
};

/**
 * https://stackoverflow.com/questions/10730309/find-all-text-nodes-in-html-page
 * Retrieves an array of all text nodes under a given element.
 *
 * @param { Node } el - The element under which to search for text nodes.
 * @returns { Node[] } An array of text nodes found under the given element.
 */
function textNodesUnder(el) {
  const children = []; // Type: Node[]
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    children.push(walker.currentNode);
  }
  return children;
}

const observer = new MutationObserver(callback);

const translateButton = document.createElement('button');
translateButton.id = 'testTranslateButton';
translateButton.textContent = 'Translate';
translateButton.style =
  'position:fixed; top:0px; left:0px; border: 1px solid black; background-color: white; color: black; z-index: 9999; padding: 10px; font-size: 16px; cursor: pointer;';

translateButton.addEventListener('click', async () => {
  if (!translating) {
    console.log('Translating started');
    translating = true;

    //push any text node from the dom without a translation into the engine
    /**
     * Retrieves all text nodes under a given element.
     *
     * @param {Element} element - The element to search for text nodes under.
     * @returns {Array<Text>} An array of text nodes found under the given element.
     */
    const allTextNodes = textNodesUnder(document);
    for (const node of allTextNodes) {
      handleNode(node);
    }

    // Start observing the target node for configured mutations
    observer.observe(targetNode, config);
  } else {
    console.log('Translating stopped');
    translating = false;
    observer.disconnect();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  document.body.appendChild(translateButton);
});
