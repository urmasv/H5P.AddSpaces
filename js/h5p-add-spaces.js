(function (H5P) {
  'use strict';

  var DEFAULT_L10N = {
    checkAnswer: 'Check',
    tryAgain: 'Try again',
    correct: 'Correct',
    incorrect: 'Incorrect',
    correctFeedback: 'Everything is correct!',
    yourResult: 'Result: @score / @max',
    correctText: 'Correct: @count',
    wrongText: 'Wrong: @count',
    missingText: 'Missing: @count',
    gapLabel: 'Type the missing mark or space here',
    emptyContent: 'The author has not added any sentences.',
    sentenceLabel: 'Sentence @num',
    solutionPrefix: 'Correct answer:',
    insertSpaceAfterLetter: 'Add a space after this character',
    punctuationButtonsLabel: 'Marks',
    punctuationButtonLabel: 'Insert mark: @symbol',
    rewriteHint: '*Instead of correcting already inserted marks, delete them all and then type them again.'
  };

  var DASHES = ['-', '‐', '‑', '‒', '–', '—', '―'];
  var APOSTROPHE_MARKS = ["'", '’', 'ʼ', '′'];
  var SPANISH_OPENING_PUNCTUATION = ['¿', '¡'];
  var DIRECT_SPEECH_OPENING_MARKS = ['„', '“', '«', '‹', '‘', '‚'];

  function AddSpaces(params, contentId, extras) {
    var self = this;

    H5P.EventDispatcher.call(self);

    self.params = params || {};
    self.contentId = contentId;
    self.extras = extras || {};
    self.l10n = merge(DEFAULT_L10N, self.params.l10n || {});
    self.mode = self.params.mode || 'spacesAndPunctuation';
    self.removableSymbols = normalizeRemovableSymbolsForMode(self.params.removableSymbols, self.mode);
    self.sentences = normalizeSentences(self.params.sentences);
    self.behaviour = merge({
      enableRetry: true,
      showCorrectTextAfterCheck: true,
      showPunctuationButtons: true
    }, self.params.behaviour || {});

    self.sentenceModels = [];
    self.checked = false;
    self.answerGiven = false;
    self.score = 0;
    self.maxScore = 0;
    self.lastResult = null;
    self.solutionVisible = false;
    self.activeGap = null;
    self.punctuationButtons = [];
  }

  AddSpaces.prototype = Object.create(H5P.EventDispatcher.prototype);
  AddSpaces.prototype.constructor = AddSpaces;

  AddSpaces.prototype.attach = function ($container) {
    var self = this;
    var container = getDomElement($container);

    self.container = container;
    container.innerHTML = '';
    container.className += ' h5p-add-spaces';

    if (!self.sentences.length) {
      var empty = document.createElement('div');
      empty.className = 'h5p-add-spaces-empty';
      empty.textContent = self.l10n.emptyContent;
      container.appendChild(empty);
      return;
    }

    self.sentenceModels = self.sentences.map(function (sentence) {
      var model = createSentenceModel(sentence.text, self.mode, self.removableSymbols);
      model.instruction = sentence.instruction || '';
      return model;
    });
    self.maxScore = calculateMaxScore(self.sentenceModels);

    var task = document.createElement('div');
    task.className = 'h5p-add-spaces-task';
    if (self.params.taskDescription) {
      task.innerHTML = self.params.taskDescription;
    }
    container.appendChild(task);

    if (self.l10n.rewriteHint) {
      var rewriteHint = document.createElement('div');
      rewriteHint.className = 'h5p-add-spaces-rewrite-hint';
      rewriteHint.textContent = self.l10n.rewriteHint;
      container.appendChild(rewriteHint);
    }

    var punctuationToolbar = createPunctuationToolbar(self);
    if (punctuationToolbar) {
      container.appendChild(punctuationToolbar);
    }

    var sentencesWrapper = document.createElement('div');
    sentencesWrapper.className = 'h5p-add-spaces-sentences';
    self.sentenceModels.forEach(function (model, index) {
      sentencesWrapper.appendChild(renderSentence(self, model, index));
    });
    container.appendChild(sentencesWrapper);

    container.appendChild(createControls(self));
    container.appendChild(createFeedback(self));

    updateControls(self);
    self.triggerResize();
  };

  AddSpaces.prototype.getAnswerGiven = function () {
    return !!this.answerGiven;
  };

  AddSpaces.prototype.getScore = function () {
    return this.score || 0;
  };

  AddSpaces.prototype.getMaxScore = function () {
    return this.maxScore || 0;
  };

  AddSpaces.prototype.showSolutions = function () {
    var self = this;
    self.sentenceModels.forEach(function (model) {
      model.gaps.forEach(function (gap) {
        gap.user = gap.expected;
        updateGapButton(self, gap);
      });
    });
    self.activeGap = null;
    self.solutionVisible = true;
    self.checked = true;
    self.evaluate(false);
    setResponseAreaLocked(self, true);
    updateSolutionVisibility(self);
  };

  AddSpaces.prototype.resetTask = function () {
    var self = this;

    self.checked = false;
    self.answerGiven = false;
    self.score = 0;
    self.lastResult = null;
    self.solutionVisible = false;
    self.activeGap = null;

    self.sentenceModels.forEach(function (model) {
      model.gaps.forEach(function (gap) {
        gap.user = '';
        gap.caret = 0;
        gap.isCorrect = undefined;
        gap.forceShow = false;

        if (gap.input) {
          gap.input.value = '';
          gap.input.classList.remove('has-value');
          gap.input.classList.remove('is-correct');
          gap.input.classList.remove('is-incorrect');
        }
        if (gap.display) {
          gap.display.innerHTML = '';
          gap.display.hidden = true;
        }

        updateGapButton(self, gap);
      });
      if (model.solutionElement) {
        model.solutionElement.hidden = true;
      }
    });

    setResponseAreaLocked(self, false);
    setPunctuationButtonsState(self);
    updateFeedback(self, '');
    updateControls(self);
    self.triggerResize();
  };

  AddSpaces.prototype.evaluate = function (sendXapi) {
    var self = this;
    var result = evaluateModels(self.sentenceModels, self.maxScore);

    self.checked = true;
    self.answerGiven = true;
    self.score = result.score;
    self.lastResult = result;
    self.activeGap = null;

    self.sentenceModels.forEach(function (model) {
      model.gaps.forEach(function (gap) {
        updateGapButton(self, gap);
      });
      if (model.solutionElement && self.behaviour.showCorrectTextAfterCheck) {
        model.solutionElement.hidden = false;
      }
    });

    setResponseAreaLocked(self, true);
    updateFeedback(self, self.l10n.yourResult
      .replace('@score', String(result.score))
      .replace('@max', String(self.maxScore)), result);
    updateControls(self);
    setPunctuationButtonsState(self);
    self.triggerResize();

    if (sendXapi !== false) {
      self.emitXAPIResult(result);
    }
  };

  AddSpaces.prototype.getXAPIData = function () {
    var event = this.getXAPIAnswerEvent();

    return event ? {
      statement: event.data.statement
    } : null;
  };

  AddSpaces.prototype.getXAPIAnswerEvent = function (result) {
    var event;
    var statementResult;

    result = result || this.lastResult || evaluateModels(this.sentenceModels, this.maxScore);
    event = this.createXAPIEvent('answered');

    if (!event || !event.data || !event.data.statement) {
      return null;
    }

    if (typeof event.setScoredResult === 'function') {
      event.setScoredResult(result.score, result.maxScore, this, true, result.success);
    }

    statementResult = event.data.statement.result = event.data.statement.result || {};
    statementResult.response = this.getXAPIResponse();
    statementResult.completion = true;
    statementResult.success = !!result.success;
    statementResult.score = statementResult.score || {};
    statementResult.score.raw = result.score;
    statementResult.score.max = result.maxScore;
    statementResult.score.min = 0;
    statementResult.score.scaled = result.maxScore > 0 ? result.score / result.maxScore : 0;

    return event;
  };

  AddSpaces.prototype.createXAPIEvent = function (verb) {
    var event;
    var definition;

    if (typeof this.createXAPIEventTemplate === 'function') {
      event = this.createXAPIEventTemplate(verb);
    }
    else if (H5P.XAPIEvent) {
      event = new H5P.XAPIEvent(verb);
    }

    if (!event || !event.data || !event.data.statement) {
      return null;
    }

    if (typeof event.getVerifiedStatementValue === 'function') {
      definition = event.getVerifiedStatementValue(['object', 'definition']);
    }
    else {
      event.data.statement.object = event.data.statement.object || {};
      definition = event.data.statement.object.definition = event.data.statement.object.definition || {};
    }

    extendObject(definition, this.getxAPIDefinition());

    return event;
  };

  AddSpaces.prototype.getxAPIDefinition = function () {
    var languageTag = this.getLanguageTag();
    var definition = {
      name: {},
      description: {},
      type: 'http://adlnet.gov/expapi/activities/cmi.interaction',
      interactionType: 'fill-in',
      correctResponsesPattern: this.getXAPICorrectResponsesPattern()
    };

    definition.name[languageTag] = this.getTitle();
    definition.name['en-US'] = definition.name[languageTag];
    definition.description[languageTag] = this.getDescription();
    definition.description['en-US'] = definition.description[languageTag];

    return definition;
  };

  AddSpaces.prototype.getXAPIResponse = function () {
    var self = this;

    return self.sentenceModels.map(function (model) {
      return self.getXAPISentenceResponse(model);
    }).join('\n');
  };

  AddSpaces.prototype.getXAPICorrectResponsesPattern = function () {
    return [this.sentenceModels.map(function (model) {
      return normalizeAnswer(model.original);
    }).join('\n')];
  };

  AddSpaces.prototype.getXAPISentenceResponse = function (model) {
    var answer = '';

    if (!model) {
      return answer;
    }

    answer += normalizeAnswer(getNormalizedGapUser(model.gaps[0]));
    model.visible.forEach(function (ch, index) {
      answer += normalizeAnswer(ch);
      answer += normalizeAnswer(getNormalizedGapUser(model.gaps[index + 1]));
    });

    return answer;
  };

  AddSpaces.prototype.getTitle = function () {
    var metadata = this.extras && this.extras.metadata;
    var title = metadata && metadata.title ? metadata.title : 'Tühikud ja kirjamärgid';

    return H5P.createTitle ? H5P.createTitle(title) : title;
  };

  AddSpaces.prototype.getDescription = function () {
    var description = stripTags(this.params.taskDescription || '').replace(/\s+/g, ' ').trim();

    return description || this.getTitle();
  };

  AddSpaces.prototype.getLanguageTag = function () {
    var metadata = this.extras && this.extras.metadata;
    var language = (metadata && (metadata.defaultLanguage || metadata.language)) || 'et';
    var parts = String(language).replace('_', '-').split('-');

    if (!parts[0]) {
      return 'et';
    }

    parts[0] = parts[0].toLowerCase();
    if (parts[1]) {
      parts[1] = parts[1].toUpperCase();
    }

    return parts.length === 1 ? parts[0] : parts.join('-');
  };

  AddSpaces.prototype.emitXAPIResult = function (result) {
    var event;

    try {
      event = this.getXAPIAnswerEvent(result);
      if (event) {
        this.trigger(event);
      }
    }
    catch (e) {
      // Older H5P integrations may not expose all xAPI helpers for custom libraries.
    }
  };

  AddSpaces.prototype.triggerAnswered = function (score, maxScore) {
    this.emitXAPIResult({
      score: score,
      maxScore: maxScore,
      wrong: Math.max(0, maxScore - score),
      success: score === maxScore
    });
  };

  AddSpaces.prototype.triggerResize = function () {
    if (H5P && typeof H5P.trigger === 'function') {
      H5P.trigger(this, 'resize');
    }
  };

  function merge(defaults, custom) {
    var merged = {};
    var key;
    defaults = defaults || {};
    custom = custom || {};

    for (key in defaults) {
      if (Object.prototype.hasOwnProperty.call(defaults, key)) {
        merged[key] = defaults[key];
      }
    }
    for (key in custom) {
      if (Object.prototype.hasOwnProperty.call(custom, key) && custom[key] !== undefined && custom[key] !== null) {
        merged[key] = custom[key];
      }
    }
    return merged;
  }

  function getDomElement($container) {
    if ($container && $container[0]) {
      return $container[0];
    }
    return $container;
  }

  function normalizeSentences(sentences) {
    if (!Array.isArray(sentences)) {
      return [];
    }
    return sentences.map(function (entry) {
      var sentence;
      var instruction = '';

      if (typeof entry === 'string') {
        sentence = entry;
      }
      else {
        sentence = entry && entry.sentence ? entry.sentence : '';
        instruction = entry && entry.instruction ? entry.instruction : '';
      }

      return {
        text: cleanAuthorText(sentence),
        instruction: cleanInstructionHtml(instruction)
      };
    }).filter(function (entry) {
      return entry.text && entry.text.length;
    });
  }

  function cleanAuthorText(text) {
    var cleaned = String(text || '');

    cleaned = decodeHtmlEntities(cleaned);
    cleaned = cleaned
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/?p[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .trim();

    return cleaned;
  }


  function cleanInstructionHtml(text) {
    var html = String(text || '');

    html = decodeHtmlEntities(html)
      .replace(/\u00a0/g, ' ')
      .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
      .trim();

    if (html === '<p></p>' || html === '<p><br></p>') {
      return '';
    }

    return html;
  }

  function getLegacyAnswerAreaInstruction(self) {
    return cleanInstructionHtml(self.params.answerAreaInstruction || '');
  }

  function decodeHtmlEntities(text) {
    var previous;
    var decoded = String(text || '');
    var textarea;

    if (typeof document === 'undefined') {
      return decoded
        .replace(/&quot;/g, '"')
        .replace(/&#34;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ');
    }

    textarea = document.createElement('textarea');
    do {
      previous = decoded;
      textarea.innerHTML = previous;
      decoded = textarea.value;
    } while (decoded !== previous && /&[a-zA-Z#0-9]+;/.test(decoded));

    return decoded;
  }

  function toChars(str) {
    if (typeof Array.from === 'function') {
      return Array.from(str || '');
    }
    return String(str || '').split('');
  }

  function isDash(ch) {
    return DASHES.indexOf(ch) !== -1;
  }

  function isApostropheMark(ch) {
    return APOSTROPHE_MARKS.indexOf(ch) !== -1;
  }

  function hasApostropheSymbol(symbols) {
    return toChars(symbols || '').some(function (ch) {
      return isApostropheMark(ch);
    });
  }

  function isSpanishOpeningPunctuation(ch) {
    return SPANISH_OPENING_PUNCTUATION.indexOf(ch) !== -1;
  }

  function isDirectSpeechOpeningMark(ch) {
    return DIRECT_SPEECH_OPENING_MARKS.indexOf(ch) !== -1;
  }

  function isPostSpaceOpeningSymbol(ch) {
    return isSpanishOpeningPunctuation(ch) || isDirectSpeechOpeningMark(ch);
  }

  function hasSpanishOpeningPunctuation(str) {
    return toChars(str || '').some(function (ch) {
      return isSpanishOpeningPunctuation(ch);
    });
  }

  function hasDashSymbol(symbols) {
    var chars = toChars(symbols);
    return chars.some(function (ch) {
      return ch === '—' || ch === '–' || ch === '−';
    });
  }

  function isWhitespace(ch) {
    return /\s/.test(ch);
  }

  function hasWhitespaceSymbol(symbols) {
    return toChars(symbols || '').some(function (ch) {
      return isWhitespace(ch);
    });
  }

  function normalizeRemovableSymbolsForMode(symbols, mode) {
    var normalized;

    if (symbols === undefined || symbols === null) {
      normalized = ' ,.;:?!—';
    }
    else {
      normalized = decodeHtmlEntities(String(symbols));
    }

    // Tühikuid nõudvates töörežiimides peab tühik olema taastamist nõudev märk.
    // H5P tekstiväli võib loendi alguses oleva nähtamatu tühiku autori muutmisel
    // kergesti ära kaotada; eriti juhtub see siis, kui autor lisab loendisse ¿ või ¡.
    // Seetõttu ei sõltu tühikute eemaldamine enam sellest, kas loendi tekst algab
    // füüsilise tühikumärgiga. Kirjavahemärgid jäävad autori loendi põhjal.
    if ((mode === 'spacesAndPunctuation' || mode === 'spacesOnly') && !hasWhitespaceSymbol(normalized)) {
      normalized = ' ' + normalized;
    }

    return normalized;
  }

  function isStandaloneHyphen(chars, index) {
    var prev = chars[index - 1];
    var next = chars[index + 1];
    return chars[index] === '-' && isWhitespace(prev || '') && isWhitespace(next || '');
  }

  function shouldRemove(ch, chars, index, mode, symbols) {
    var symbolChars = toChars(symbols);
    var removesSpace = symbolChars.indexOf(' ') !== -1;
    var dashWanted = hasDashSymbol(symbols);
    var apostropheWanted = hasApostropheSymbol(symbols);

    if (isWhitespace(ch)) {
      return mode === 'punctuationOnly' ? false : removesSpace;
    }

    if (mode === 'spacesOnly') {
      return false;
    }

    if (symbolChars.indexOf(ch) !== -1) {
      return true;
    }

    if (dashWanted && (ch === '—' || ch === '–' || ch === '―' || isStandaloneHyphen(chars, index))) {
      return true;
    }

    if (apostropheWanted && isApostropheMark(ch)) {
      return true;
    }

    return false;
  }

  function normalizeExpectedSymbol(ch) {
    if (isWhitespace(ch)) {
      return ' ';
    }
    if (isDash(ch)) {
      return '—';
    }
    if (isApostropheMark(ch)) {
      return "'";
    }
    return ch;
  }

  function normalizeAnswer(str) {
    return toChars(str || '').map(function (ch) {
      return normalizeExpectedSymbol(ch);
    }).join('');
  }

  function createSentenceModel(sentence, mode, symbols) {
    var chars = toChars(cleanAuthorText(sentence));
    var visible = [];
    var gaps = [createGap('', mode)]; // Enne esimese nähtava märgi kohta.

    chars.forEach(function (ch, index) {
      if (shouldRemove(ch, chars, index, mode, symbols)) {
        gaps[gaps.length - 1].expected += normalizeExpectedSymbol(ch);
      }
      else {
        visible.push(ch);
        gaps.push(createGap('', mode)); // Vahekoht pärast äsja lisatud nähtavat märki.
      }
    });

    return {
      original: chars.join(''),
      visible: visible,
      gaps: gaps,
      sentenceElement: null,
      solutionElement: null
    };
  }

  function createGap(expected, mode) {
    return {
      expected: expected || '',
      user: '',
      button: null,
      isCorrect: undefined,
      isFinal: false,
      mode: mode || 'spacesAndPunctuation',
      forceShow: false
    };
  }

  function calculateMaxScore(models) {
    var max = 0;
    models.forEach(function (model) {
      model.gaps.forEach(function (gap) {
        if (gap.expected.length > 0) {
          max += 1;
        }
      });
    });
    return Math.max(max, 1);
  }

  function createPunctuationToolbar(self) {
    var symbols;
    var toolbar;
    var label;

    if (!self.behaviour.showPunctuationButtons || self.mode === 'spacesOnly') {
      return null;
    }

    symbols = getPunctuationButtonSymbols(self.removableSymbols);
    if (!symbols.length) {
      return null;
    }

    toolbar = document.createElement('div');
    toolbar.className = 'h5p-add-spaces-punctuation-toolbar';

    label = document.createElement('span');
    label.className = 'h5p-add-spaces-punctuation-label';
    label.textContent = self.l10n.punctuationButtonsLabel || 'Kirjamärgid';
    toolbar.appendChild(label);

    self.punctuationButtons = [];
    symbols.forEach(function (symbol) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'h5p-add-spaces-control h5p-add-spaces-punctuation-button';
      button.textContent = symbol;
      button.setAttribute('aria-label', getPunctuationButtonLabel(self, symbol));
      button.disabled = true;

      button.addEventListener('mousedown', function (event) {
        event.preventDefault();
      });

      button.addEventListener('click', function () {
        insertPunctuationIntoActiveGap(self, symbol);
      });

      self.punctuationButtons.push(button);
      toolbar.appendChild(button);
    });

    return toolbar;
  }

  function getPunctuationButtonSymbols(symbols) {
    var seen = {};
    var buttonSymbols = [];

    toChars(symbols || '').forEach(function (symbol) {
      var normalized = normalizeExpectedSymbol(symbol);

      if (isWhitespace(symbol)) {
        return;
      }
      if (isDash(symbol)) {
        normalized = '—';
      }
      if (!seen[normalized]) {
        seen[normalized] = true;
        buttonSymbols.push(normalized);
      }
    });

    return buttonSymbols;
  }

  function getPunctuationButtonLabel(self, symbol) {
    return (self.l10n.punctuationButtonLabel || 'Lisa kirjavahemärk: @symbol')
      .replace('@symbol', symbol);
  }

  function setActiveGap(self, gap) {
    if (!gap || self.checked) {
      return;
    }
    self.activeGap = gap;
    rememberGapCaret(gap);
    setPunctuationButtonsState(self);
  }

  function rememberGapCaret(gap) {
    if (!gap || !gap.input || typeof gap.input.selectionStart !== 'number') {
      return;
    }
    gap.caret = gap.input.selectionStart;
  }

  function setPunctuationButtonsState(self) {
    var disabled = self.checked || !self.activeGap || !self.activeGap.input || self.activeGap.wrapper.hidden;

    (self.punctuationButtons || []).forEach(function (button) {
      button.disabled = !!disabled;
    });
  }

  function setResponseAreaLocked(self, locked) {
    (self.sentenceModels || []).forEach(function (model) {
      var characterButtons;

      if (model.sentenceElement) {
        model.sentenceElement.classList.toggle('is-locked', !!locked);
        characterButtons = model.sentenceElement.querySelectorAll('.h5p-add-spaces-char');
        Array.prototype.forEach.call(characterButtons, function (button) {
          button.disabled = !!locked;
          button.setAttribute('aria-disabled', locked ? 'true' : 'false');
        });
      }

      (model.gaps || []).forEach(function (gap) {
        if (gap.input) {
          gap.input.disabled = !!locked;
          if (locked) {
            gap.input.setAttribute('tabindex', '-1');
          }
          else {
            gap.input.removeAttribute('tabindex');
          }
        }
      });
    });
  }

  function insertPunctuationIntoActiveGap(self, symbol) {
    var gap = self.activeGap;
    var input;
    var value;
    var start;
    var end;
    var insertion;

    if (self.checked || !gap || !gap.input || gap.wrapper.hidden) {
      return;
    }

    input = gap.input;
    value = input.value || gap.user || '';
    start = typeof input.selectionStart === 'number' ? input.selectionStart : gap.caret;
    end = typeof input.selectionEnd === 'number' ? input.selectionEnd : start;

    if (typeof start !== 'number') {
      start = value.length;
    }
    if (typeof end !== 'number') {
      end = start;
    }

    insertion = insertSymbolIntoGapValue(value, symbol, start, end, gap);
    gap.user = insertion.value;
    gap.caret = insertion.caret;
    gap.isCorrect = undefined;
    updateGapButton(self, gap, true, insertion.caret);
    self.answerGiven = hasAnyAnswer(self.sentenceModels);
    updateControls(self);
    setPunctuationButtonsState(self);
    self.triggerResize();
  }

  function insertSymbolIntoGapValue(value, symbol, start, end, gap) {
    var inserted;
    var normalized;

    value = normalizeTypedGap(value);
    start = Math.max(0, Math.min(start, value.length));
    end = Math.max(start, Math.min(end, value.length));

    inserted = value.slice(0, start) + symbol + value.slice(end);
    normalized = normalizeGapSymbolOrder(inserted, gap, start + symbol.length);

    return {
      value: normalized.value,
      caret: normalized.caret
    };
  }

  function normalizeGapSymbolOrder(value, gap, caretHint) {
    var chars;
    var normalSymbols = [];
    var spaces = [];
    var postSpaceOpeners = [];
    var rebuilt;

    value = normalizeTypedGap(value);

    if (!value) {
      return {
        value: '',
        caret: 0
      };
    }

    chars = toChars(value);

    chars.forEach(function (ch) {
      if (isPostSpaceOpeningSymbol(ch)) {
        postSpaceOpeners.push(ch);
      }
      else if (ch === ' ') {
        spaces.push(ch);
      }
      else {
        normalSymbols.push(ch);
      }
    });

    // Ühe eemaldatud koha sees on järjekord alati:
    // 1) tavalised kirjavahemärgid/sümbolid, 2) tühik(ud),
    // 3) hispaania avamärgid ¿ ja ¡ ning otsest kõnet alustavad avamärgid.
    // Seetõttu muutub näiteks " ," -> ", ", aga " ¿" ja " „" jäävad kujule " ¿" ja " „".
    rebuilt = normalSymbols.join('') + spaces.join('') + postSpaceOpeners.join('');

    return {
      value: rebuilt,
      caret: rebuilt.length
    };
  }

  function renderSentence(self, model, index) {
    var wrapper = document.createElement('div');
    wrapper.className = 'h5p-add-spaces-sentence';
    model.sentenceElement = wrapper;

    var answerInstruction = model.instruction || (index === 0 ? getLegacyAnswerAreaInstruction(self) : '');
    if (answerInstruction) {
      var instruction = document.createElement('div');
      instruction.className = 'h5p-add-spaces-answer-instruction';
      instruction.innerHTML = answerInstruction;
      wrapper.appendChild(instruction);
    }

    var line = document.createElement('div');
    line.className = 'h5p-add-spaces-line';
    line.setAttribute('dir', 'auto');

    // Lause alguses olev ühemärgine sisestusala peab olema alati olemas,
    // mitte ainult siis, kui eemaldatavate sümbolite loendis on ¿ või ¡.
    // Seda on vaja ka näiteks jutumärkidega algavate lausete jaoks.
    if (model.gaps[0]) {
      line.appendChild(createGapInput(self, model.gaps[0], true));
    }

    model.visible.forEach(function (ch, charIndex) {
      var afterGap = model.gaps[charIndex + 1];
      line.appendChild(createCharacterButton(self, afterGap, ch));
      line.appendChild(createGapInput(self, afterGap, false));
    });

    wrapper.appendChild(line);

    var solution = document.createElement('div');
    solution.className = 'h5p-add-spaces-solution';
    solution.hidden = true;

    var solutionPrefix = document.createElement('strong');
    solutionPrefix.textContent = self.l10n.solutionPrefix + ' ';
    solution.appendChild(solutionPrefix);
    solution.appendChild(document.createTextNode(model.original));
    wrapper.appendChild(solution);
    model.solutionElement = solution;

    return wrapper;
  }

  function createCharacterButton(self, gap, ch) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'h5p-add-spaces-char';
    button.textContent = ch === ' ' ? '\u00a0' : ch;
    button.setAttribute('aria-label', getAfterLetterLabel(self) + ': ' + (ch === ' ' ? 'tühik' : ch));

    button.addEventListener('click', function () {
      var focusGapPosition;

      if (self.checked) {
        return;
      }

      if (self.mode === 'punctuationOnly') {
        gap.forceShow = true;
        gap.isCorrect = undefined;
        updateGapButton(self, gap);
        setActiveGap(self, gap);
        focusGapInput(gap, gap.user.length);
      }
      else {
        if (gapExpectsSpace(gap)) {
          ensureSpaceAfter(gap);
          focusGapPosition = 0;
        }
        else {
          gap.forceShow = true;
          focusGapPosition = gap.user.length;
        }
        gap.isCorrect = undefined;
        updateGapButton(self, gap);
        setActiveGap(self, gap);
        focusGapInput(gap, focusGapPosition);
      }

      self.answerGiven = hasAnyAnswer(self.sentenceModels);
      updateControls(self);
      self.triggerResize();
    });

    return button;
  }

  function getAfterLetterLabel(self) {
    return self.l10n.insertSpaceAfterLetter || 'Lisa tühik selle märgi järele';
  }


  function createGapInput(self, gap, isInitial) {
    var wrapper = document.createElement('span');
    wrapper.className = 'h5p-add-spaces-gap-wrap';
    if (isInitial) {
      wrapper.className += ' is-initial';
    }

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'h5p-add-spaces-gap';
    input.setAttribute('aria-label', isInitial ? self.l10n.gapLabel : self.l10n.gapLabel);
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('inputmode', 'text');

    var display = document.createElement('span');
    display.className = 'h5p-add-spaces-gap-result';
    display.setAttribute('aria-live', 'polite');
    display.hidden = true;

    wrapper.appendChild(input);
    wrapper.appendChild(display);

    gap.wrapper = wrapper;
    gap.input = input;
    gap.display = display;
    gap.button = input;
    gap.isFinal = false;
    gap.isInitial = !!isInitial;
    gap.alwaysShow = !!isInitial;

    input.addEventListener('focus', function () {
      if (self.checked) {
        input.blur();
        return;
      }
      setActiveGap(self, gap);
    });

    input.addEventListener('click', function (event) {
      if (self.checked) {
        event.preventDefault();
        return;
      }
      setActiveGap(self, gap);
    });

    input.addEventListener('keyup', function () {
      rememberGapCaret(gap);
    });

    input.addEventListener('input', function () {
      var caret = typeof input.selectionStart === 'number' ? input.selectionStart : undefined;
      if (self.checked) {
        input.value = gap.user;
        return;
      }
      setActiveGap(self, gap);
      var normalized = normalizeGapSymbolOrder(input.value, gap, caret);
      gap.user = normalized.value;
      input.value = gap.user;
      gap.caret = normalized.caret;
      gap.isCorrect = undefined;
      updateGapButton(self, gap, true, gap.caret);
      self.answerGiven = hasAnyAnswer(self.sentenceModels);
      updateControls(self);
      self.triggerResize();
    });

    input.addEventListener('keydown', function (event) {
      if (self.checked) {
        event.preventDefault();
        return;
      }
      if (event.key === 'Escape') {
        gap.user = '';
        gap.forceShow = false;
        gap.isCorrect = undefined;
        updateGapButton(self, gap);
        if (gap.wrapper.hidden) {
          self.activeGap = null;
        }
        self.answerGiven = hasAnyAnswer(self.sentenceModels);
        updateControls(self);
        setPunctuationButtonsState(self);
        self.triggerResize();
        event.preventDefault();
      }
    });

    input.addEventListener('blur', function () {
      rememberGapCaret(gap);
      if (!self.checked && !gap.user && gap.forceShow) {
        gap.forceShow = false;
      }
      updateGapButton(self, gap);
    });

    updateGapButton(self, gap);
    return wrapper;
  }

  function normalizeTypedGap(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/[\u200b\u200c\u200d\ufeff]/g, '');
  }

  function gapExpectsSpace(gap) {
    if (!gap || !gap.expected) {
      return true;
    }
    return toChars(gap.expected).some(function (ch) {
      return ch === ' ';
    });
  }

  function ensureSpaceAfter(gap) {
    var normalized;

    if (gap.user.indexOf(' ') === -1) {
      gap.user += ' ';
    }

    normalized = normalizeGapSymbolOrder(gap.user, gap, gap.user.length);
    gap.user = normalized.value;
    gap.caret = normalized.caret;
  }

  function focusGapInput(gap, position) {
    if (!gap.input || typeof gap.input.focus !== 'function') {
      return;
    }
    gap.input.focus();
    if (typeof gap.input.setSelectionRange === 'function') {
      try {
        gap.input.setSelectionRange(position, position);
      }
      catch (err) {}
    }
  }

  function renderUserSymbols(str) {
    if (!str) {
      return '';
    }
    return toChars(str).map(function (ch) {
      if (ch === ' ') {
        return 'tühik';
      }
      return ch;
    }).join('');
  }

  function shouldShowGap(gap) {
    if (gap.alwaysShow || gap.forceShow) {
      return true;
    }
    if (gap.user.length > 0) {
      return true;
    }
    if (gap.isCorrect === false) {
      return true;
    }
    if (gap.expected.length > 0 && gap.isCorrect === true) {
      return true;
    }
    return false;
  }

  function updateGapButton(self, gap, keepFocus, caret) {
    var show = shouldShowGap(gap);
    var activeElement = typeof document !== 'undefined' ? document.activeElement : null;

    if (!gap.wrapper || !gap.input || !gap.display) {
      return;
    }

    gap.wrapper.hidden = !show;
    if (!show) {
      gap.input.hidden = true;
      gap.display.hidden = true;
      if (self.activeGap === gap) {
        self.activeGap = null;
        setPunctuationButtonsState(self);
      }
      return;
    }

    gap.input.classList.toggle('has-value', gap.user.length > 0);
    gap.input.classList.remove('is-correct');
    gap.input.classList.remove('is-incorrect');

    if (self.checked) {
      gap.input.hidden = true;
      gap.display.hidden = false;
      renderGapDisplay(gap);
      gap.wrapper.title = gap.isCorrect === true ? self.l10n.correct + ': ' + renderUserSymbols(gap.user) : self.l10n.incorrect;
    }
    else {
      gap.input.hidden = false;
      gap.display.hidden = true;
      gap.input.value = gap.user || '';
      gap.input.placeholder = gap.isInitial ? '' : (gap.user ? '' : '…');
      setGapInputWidth(gap);
      gap.input.disabled = false;
      gap.input.title = self.l10n.gapLabel;
    }

    if (keepFocus && activeElement === gap.input && !self.checked) {
      focusGapInput(gap, typeof caret === 'number' ? caret : gap.user.length);
    }
  }


  function setGapInputWidth(gap) {
    var length;

    if (gap.isInitial && !gap.user) {
      gap.input.size = 1;
      gap.input.style.width = '1em';
      return;
    }

    length = Math.max(gap.user.length, gap.expected.length, 1);
    length = Math.max(1, Math.min(8, length));

    if (!gap.input) {
      return;
    }

    gap.input.size = length;
    gap.input.style.width = Math.max(0.6, length * 0.6) + 'em';
  }

  function renderGapDisplay(gap) {
    var expectedChars = toComparableChars(gap.expected);
    var userChars = toComparableChars(gap.user);
    var max = Math.max(expectedChars.length, userChars.length);
    var index;

    gap.display.innerHTML = '';

    if (gap.isCorrect === true) {
      appendPlainText(gap.display, gap.user);
      return;
    }

    for (index = 0; index < max; index++) {
      var expected = expectedChars[index];
      var user = userChars[index];

      if (expected && user && expected.normalized === user.normalized) {
        appendPlainChar(gap.display, user.raw);
        continue;
      }

      if (user) {
        appendClassifiedChar(gap.display, user.raw, true);
      }
      if (expected) {
        appendClassifiedChar(gap.display, expected.raw, false);
      }
    }
  }

  function toComparableChars(str) {
    return toChars(str || '').map(function (ch) {
      return {
        raw: normalizeExpectedSymbol(ch),
        normalized: normalizeExpectedSymbol(ch)
      };
    });
  }

  function appendPlainText(parent, text) {
    toChars(text || '').forEach(function (ch) {
      appendPlainChar(parent, ch);
    });
  }

  function appendPlainChar(parent, ch) {
    var span = document.createElement('span');
    span.className = 'h5p-add-spaces-result-plain';
    span.textContent = ch === ' ' ? '\u00a0' : ch;
    parent.appendChild(span);
  }

  function appendClassifiedChar(parent, ch, isExtra) {
    var span = document.createElement('span');
    var isSpace = ch === ' ';

    if (isExtra) {
      span.className = isSpace ? 'h5p-add-spaces-extra-space' : 'h5p-add-spaces-extra-punctuation';
      span.setAttribute('aria-label', isSpace ? 'Liigne tühik' : 'Liigne kirjavahemärk');
    }
    else {
      span.className = isSpace ? 'h5p-add-spaces-missing-space' : 'h5p-add-spaces-missing-punctuation';
      span.setAttribute('aria-label', isSpace ? 'Puuduv tühik' : 'Puuduv kirjavahemärk');
    }

    span.textContent = isSpace ? '\u00a0' : ch;
    parent.appendChild(span);
  }

  function createControls(self) {
    var controls = document.createElement('div');
    controls.className = 'h5p-add-spaces-controls';

    var check = document.createElement('button');
    check.type = 'button';
    check.className = 'h5p-add-spaces-control h5p-add-spaces-check';
    check.textContent = self.l10n.checkAnswer;
    check.disabled = true;
    check.setAttribute('aria-disabled', 'true');
    check.addEventListener('click', function () {
      if (!self.answerGiven) {
        return;
      }
      self.evaluate(true);
    });
    controls.appendChild(check);
    self.checkButton = check;

    if (self.behaviour.enableRetry) {
      var retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'h5p-add-spaces-control h5p-add-spaces-retry';
      retry.textContent = self.l10n.tryAgain;
      retry.hidden = true;
      retry.addEventListener('click', function () {
        self.resetTask();
      });
      controls.appendChild(retry);
      self.retryButton = retry;
    }


    return controls;
  }

  function createFeedback(self) {
    var feedback = document.createElement('div');
    feedback.className = 'h5p-add-spaces-feedback';
    feedback.setAttribute('aria-live', 'polite');
    self.feedbackElement = feedback;
    return feedback;
  }

  function updateFeedback(self, message, result) {
    var score;
    var correctFeedback;
    var details;

    if (!self.feedbackElement) {
      return;
    }

    self.feedbackElement.innerHTML = '';
    self.feedbackElement.classList.remove('h5p-add-spaces-feedback-success');
    self.feedbackElement.classList.remove('h5p-add-spaces-feedback-failure');

    if (!message) {
      return;
    }

    if (result && result.success && self.l10n.correctFeedback) {
      correctFeedback = document.createElement('div');
      correctFeedback.className = 'h5p-add-spaces-result-score';
      correctFeedback.textContent = self.l10n.correctFeedback;
      self.feedbackElement.appendChild(correctFeedback);
    }

    score = document.createElement('div');
    score.className = 'h5p-add-spaces-result-score';
    score.textContent = message;
    self.feedbackElement.appendChild(score);

    if (result) {
      details = document.createElement('div');
      details.className = 'h5p-add-spaces-result-details';
      details.appendChild(createResultDetail(self.l10n.correctText || 'Correct: @count', result.correct || 0, 'correct'));
      details.appendChild(createResultDetail(self.l10n.wrongText || 'Wrong: @count', result.wrong || 0, 'wrong'));
      details.appendChild(createResultDetail(self.l10n.missingText || 'Missing: @count', result.missing || 0, 'missing'));
      self.feedbackElement.appendChild(details);
      self.feedbackElement.classList.add(result.success ? 'h5p-add-spaces-feedback-success' : 'h5p-add-spaces-feedback-failure');
    }
  }

  function createResultDetail(template, count, status) {
    var wrapper = document.createElement('span');
    var parts = splitTemplateAroundCount(template);
    var label = '';
    var labelSpan;
    var countBox = document.createElement('span');
    var stateClass = '';

    wrapper.className = 'h5p-correct-errors-result-detail-item h5p-add-spaces-result-detail';

    label = ((parts.before || '') + (parts.after || '')).trim();
    if (label) {
      labelSpan = document.createElement('span');
      labelSpan.textContent = label;
      wrapper.appendChild(labelSpan);
    }

    if (status === 'correct') {
      stateClass = 'h5p-correct-errors-select-correct h5p-add-spaces-result-count-correct';
    }
    else if (status === 'wrong') {
      stateClass = 'h5p-correct-errors-select-wrong h5p-add-spaces-result-count-wrong';
    }
    else if (status === 'missing') {
      stateClass = 'h5p-correct-errors-select-missing h5p-add-spaces-result-count-missing';
    }

    countBox.className = 'h5p-correct-errors-feedback-count h5p-add-spaces-result-count ' + stateClass;
    countBox.textContent = String(count);
    wrapper.appendChild(countBox);

    return wrapper;
  }

  function splitTemplateAroundCount(template) {
    var source = template || '';
    var index = source.indexOf('@count');

    if (index === -1) {
      return { before: source, after: '' };
    }

    return {
      before: source.slice(0, index),
      after: source.slice(index + 6)
    };
  }

  function replacePlaceholders(template, values) {
    var result = String(template || '');
    var key;

    values = values || {};
    for (key in values) {
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        result = result.split('@' + key).join(String(values[key]));
      }
    }

    return result;
  }

  function updateControls(self) {
    var checkDisabled;

    self.answerGiven = hasAnyAnswer(self.sentenceModels);

    if (self.checkButton) {
      checkDisabled = !self.checked && !self.answerGiven;
      self.checkButton.hidden = !!self.checked;
      self.checkButton.disabled = !!checkDisabled;
      self.checkButton.setAttribute('aria-disabled', checkDisabled ? 'true' : 'false');
    }
    if (self.retryButton) {
      self.retryButton.hidden = !self.checked;
    }
    setPunctuationButtonsState(self);
  }

  function updateSolutionVisibility(self) {
    self.sentenceModels.forEach(function (model) {
      model.gaps.forEach(function (gap) {
        updateGapButton(self, gap);
      });
      if (model.solutionElement) {
        model.solutionElement.hidden = !self.solutionVisible;
      }
    });
    updateControls(self);
    self.triggerResize();
  }

  function hasAnyAnswer(models) {
    return models.some(function (model) {
      return model.gaps.some(function (gap) {
        return gap.user.length > 0;
      });
    });
  }

  function evaluateModels(models, maxScore) {
    var incorrectGaps = 0;
    var correct = 0;
    var wrong = 0;
    var missing = 0;
    var score;

    models.forEach(function (model) {
      trimIgnoredSentenceEndSpaces(model);
      model.gaps.forEach(function (gap) {
        var ordered = normalizeGapSymbolOrder(gap.user, gap);
        var expected;
        var user;

        gap.user = ordered.value;
        expected = normalizeAnswer(gap.expected);
        user = normalizeAnswer(gap.user);
        gap.isCorrect = expected === user;

        if (gap.isCorrect) {
          if (expected.length > 0) {
            correct += 1;
          }
          return;
        }

        incorrectGaps += 1;
        if (user.length > 0) {
          wrong += 1;
        }
        if (expected.length > 0) {
          missing += 1;
        }
      });
    });

    score = Math.max(0, maxScore - incorrectGaps);

    return {
      score: score,
      maxScore: maxScore,
      correct: correct,
      wrong: wrong,
      missing: missing,
      incorrect: incorrectGaps,
      success: score === maxScore
    };
  }

  function trimIgnoredSentenceEndSpaces(model) {
    var lastGap;

    if (!model || !model.gaps || !model.gaps.length) {
      return;
    }

    lastGap = model.gaps[model.gaps.length - 1];
    if (!lastGap || !lastGap.user) {
      return;
    }

    // Viimase nähtava märgi järel olevad tühikud on tehniline ülejääk,
    // mitte sisuline vastuseviga. Näiteks korrektne punkt + ekslik lõputühik
    // loetakse samaks vastuseks nagu ainult korrektne punkt.
    lastGap.user = String(lastGap.user).replace(/ +$/g, '');
  }

  function getNormalizedGapUser(gap) {
    if (!gap) {
      return '';
    }
    return normalizeGapSymbolOrder(gap.user || '', gap).value;
  }

  function extendObject(target, source) {
    var key;

    target = target || {};
    source = source || {};

    for (key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        target[key] = source[key];
      }
    }

    return target;
  }

  function stripTags(text) {
    return String(text || '').replace(/<[^>]+>/g, '');
  }

  function getXapiDescription(self) {
    return self.sentences.map(function (sentence) {
      return sentence.text;
    }).join('\n');
  }

  H5P.AddSpaces = AddSpaces;
})(H5P);
