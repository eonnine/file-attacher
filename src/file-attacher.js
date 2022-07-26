(function (factory) {
  if(typeof exports === 'object' && typeof module === 'object') {
    module.exports = factory;
  }
  else if(typeof define === 'function' && define.amd) {
    define([], factory);
  }
  else if(typeof exports === 'object') {
    exports["FileAttacher"] = factory;
  }
  else {
    window['FileAttacher'] = factory;
  }
}(
  (function FileAttacherFactory(___LayoutFactory, ___DoublyLinkedMapFactory, ___Util, ___Ajax, ___Log) {
    'use strict'
    
    const __defaultConfig = {
      fileIds: [],
      url: {
        fetch: null,
      },
      layout: {
        scroll: true,
        noti: {
          use: true,
          type: 'box',
        },
      },
      validate: {
        size: 52428800,
        maxCount: 20,
        includes: [],
        excludes: [],
      },
      message: {
        info: {
          introduce: '첨부할 파일을 이 곳에 드래그하세요',
          download: '다운로드가 완료되었습니다',
        },
        error: {
          size_overflow: '허용된 크기보다 용량이 큰 파일이 포함되어 있습니다',
          count_overflow: '허용된 개수를 초과하였습니다',
          invalid_extension: '허용되지 않은 파일 확장자가 포함되어 있습니다',
          download: '다운로드 중 오류가 발생했습니다',
          file_add: '파일 추가 중 오류가 발생했습니다',
          same_name: '동일한 이름의 파일이 존재합니다',
        }
      },
      hook: {
        allowGlobal: true,
      },
      onError: null,
    };

    const __getBaseConfig = function (keyChain) {
      return ___Util.find(__defaultConfig, keyChain);
    }

    const __setBaseConfig = function (customConfig) {
      if (typeof customConfig === 'function') {
        ___Util.mergeMap(__defaultConfig, customConfig());
        return;
      }
      if (___Util.isObject(customConfig)) {
        ___Util.mergeMap(__defaultConfig, customConfig);
        return;
      }
      ___Log.throwError(TypeError, `Config type must be 'function' or 'object'`);
    }

    const __FileShape = {
      name: null,
      size: 0,
      src: null,
    };

    function FileAttacher(elementId, option) {
      if (!(this instanceof FileAttacher)) {
        ___Log.throwError(SyntaxError, '"new" constructor operator is required');
      }
      this.initValidator(elementId, option);
      
      this._util = ___Util;
      this._layoutEventType = ___LayoutFactory.eventType;

      this._id = elementId;
      this._config = this.makeConfig(option);
      this._layout = ___LayoutFactory.create();
      this._store = ___DoublyLinkedMapFactory.create();
      this._removedIdStore = ___DoublyLinkedMapFactory.create();
      this._state = {
        draggable: {
          currentKey: null,
        },
      };

      this.init();
      this._callee = this.makeInterface();
      return this._callee;
    }

    (function FileAttacherPrototype() {
      this.errorType = {
        VALIDATOR: 'validator',
        DOWNLOAD: 'download',
      }
      
      this.makeConfig = function(option) {
        return this._util.mergeMap(__defaultConfig, option);
      }

      this.getConfig = function (keyChain) {
        return this._util.find(this._config, keyChain);
      }

      this.getState = function (keyChain) {
        return this._util.find(this._state, keyChain);
      }

      this.setState = function (keyChain, value) {
        this._util.setObject(this._state, keyChain, value);
      }

      this.extractIdObject = function (obj) {
        return this.getConfig('fileIds').reduce((acc, key) => {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            acc[key] = obj[key];
          }
          return acc;
        }, {});
      }

      this.dispatchHook = async function (name, hookParam) {
        const isAllowGlobalHook = this.getConfig('hook.allowGlobal');
        const baseHook = __getBaseConfig(name);
        const hook = this.getConfig(name);

        if (isAllowGlobalHook && baseHook && await baseHook.call(this._callee, hookParam) === false) {
          return false;
        }
        if (hook && baseHook !== hook && await hook.call(this._callee, hookParam) === false) {
          return false;
        }
        return true;
      }

      this.dispatchError = function (name, type, message) {
        const { use: useNoti, type: notiType } = this.getConfig('layout.noti');
        if (useNoti) {
          this._layout.printNotiError(notiType, message);
        }
        this.dispatchHook(name, { type, message });
      }

      this.init = function () {
        const { $frame, $input } = this._layout.renderLayout(this._id, this.getConfig('layout'), this.getConfig('message'));
        this._layout.bindFrameEvent($frame);
        this.bindFrameEvent($frame);
        this.bindInputEvent($input);
      }

      this.addNewFiles = async function (files) {
        if (!this.validateFileByConfig(files)) {
          ___Log.error('Invalid file exists');
          return;
        }
        
        Object.values(files).forEach(async file => {
          const name = this.generateName(file.name);
          const src = await this.readFile(file);
          const newFile = this.createNewFile(name, file);

          this._store.put(name, {
            name,
            src,
            size: newFile.size,
            file: newFile,
            isNew: true,
            element: null,
          });
          this.addFilePreview(name);
        });
      }

      this.addFiles = function (files) {
        if (!this.validateFileByConfig(files)) {
          ___Log.warn('Could not add files because of exists invalid file');
          this.dispatchError('onError', this.errorType.DOWNLOAD, this.getConfig('message.error.file_add'));
          return;
        }

        files.forEach(file => {
          if (this.validateFileByShape(file)) {
            ___Log.error('Could not add invalid file', file);
            this.dispatchError('onError', this.errorType.DOWNLOAD, this.getConfig('message.error.file_add'));
            return;
          }
          if (this._store.contains(file.name)) {
            ___Log.error('Colud not add same name file', file);
            this.dispatchError('onError', this.errorType.DOWNLOAD, this.getConfig('message.error.same_name'));
            return;
          }
          const newFile = this.extractIdObject(file);
          this._store.put(file.name, {
            name: file.name,
            src: file.src,
            size: file.size,
            file: newFile,
            isNew: false,
            element: null,
          });
          this.addFilePreview(file.name);
        });
      }

      this.addFilePreview = async function(key) {
        const item = this._store.get(key);
        const preview = this._layout.createPreview(item.src, item.name, item.size, item.isNew);
        item.element = preview;

        this.bindPreviewEvent(preview);
        this._layout.bindPreviewEvent(preview);
        this._layout.renderPreview(preview);
        
        if (item.isNew) {
          this._layout.showProgress(preview);
        }
      }

      this.removeFile = function (key) {
        if (!this._store.contains(key)) {
          ___Log.warn('File matching the key does not exist');
          return;
        }
        
        const item = this._store.get(key);
        
        if (!item.isNew) {
          const fileIds = this.extractIdObject(item.file);
          this._removedIdStore.put(key, fileIds);
        }

        this._layout.removePreview(item.element);
        item.element.remove();
        item.element = null;
        item.file = null;
        item.src = null;
        this._store.remove(key);
      }

      this.removeAllFiles = function () {
        for (let key in this._store.map){
          this.removeFile(key);
        }
      }

      this.changeFilePosition = async function (fromKey, toKey, pointX, pointY) {
        if (!fromKey || !toKey) {
          return;
        }
        
        let newKey;
        const toItem = this._store.get(toKey);
        if (this._layout.isPointOverHalfRight(pointX, pointY, toItem.element.offsetWidth, toItem.element.getBoundingClientRect())) {
          newKey = this._store.getNextKey(toKey);
        } else {
          newKey = toKey;
        }
        
        this._store.change(fromKey, newKey);

        const fromItem = this._store.get(fromKey);
        const newItem = this._store.get(newKey);
        this._layout.changePreviewPosition(fromItem.element, newItem?.element);
      }

      this.downloadFile = async function (key) {
        const item = this._store.get(key);
        try {
          const { name, src, isNew } = item;

          if (isNew) {
            this.downloadViaLink(name, src);  
          } else {
            const url = window.URL.createObjectURL(src);
            this.downloadViaLink(name, url);
            window.URL.revokeObjectURL(url);
          }

          this.printDownloadSuccessMessage();
        } catch (e) {
          ___Log.error(e.message);
          this.dispatchError('onError', this.errorType.DOWNLOAD, this.getConfig('message.error.download'));
        }
      }

      this.printDownloadSuccessMessage = function() {
        const { use: useNoti, type: notiType } = this.getConfig('layout.noti');
        if (useNoti) {
          const message = this.getConfig('message.info.download');
          this._layout.printNotiInfo(notiType, message);
        }
      }

      this.downloadViaLink = function(name, url) {
        const link = this._layout.createDownloadLink(name, url);
        link.click();
        link.remove();
      }

      this.clear = function () {
        this.removeAllFiles();
        // this._store.clear();
        // this._removedIdStore.clear();
        // this._layout.clearInFrame();
      }

      this.findItem = function ($el) {
        return this._store.toArray().find(item => item.element === $el);
      }

      this.bindFrameEvent = function ($el) {
        $el.addEventListener(this._layoutEventType.DRAG_END, e => {
          if (this._layout.isPointMoveOut(e.x, e.y)) {
            const item = this.findItem(e.target);
            this.removeFile(item.name);
          }
        });
        $el.addEventListener(this._layoutEventType.DROP, e => {
          this.addNewFiles(e.dataTransfer.files);
        });
      }

      this.bindPreviewEvent = function ($el) {
        $el.addEventListener(this._layoutEventType.DRAG_START, e => {
          const item = this.findItem(e.target);
          this.setState('draggable.currentKey', item.name);
        });
        $el.addEventListener(this._layoutEventType.DRAG_END, () => {
          this.setState('draggable.currentKey', null);
        });
        $el.addEventListener(this._layoutEventType.DROP, e => {
          const fromKey = this.getState('draggable.currentKey');
          if (fromKey) {
            const toItem = this.findItem(e.target);
            this.changeFilePosition(fromKey, toItem.name, e.x, e.y);
          }
        });
        $el.addEventListener(this._layoutEventType.DOUBLE_CLICK, e => {
          const item = this.findItem(e.target);
          this.downloadFile(item.name);
        });
      }

      this.bindInputEvent = function ($el) {
        $el.addEventListener(this._layoutEventType.INPUT, e => {
          this.addNewFiles(e.target.files).finally(() => {
            e.target.value = null;
          });
        });
      }

      this.generateName = function (k) {
        const
          temp = k.split('.'),
          extension = temp.pop(),
          name = temp.join('');

        let
          key = k,
          suffix = 0;

        while (this._store.contains(key)) {
          suffix++;
          key = `${name} (${suffix}).${extension}`;
        }

        return key;
      }

      /*
      * 파일객체를 새 Blob객체로 생성 (파일 객체의 name속성은 불변 속성이므로 변경하기 위함)
      */
      this.createNewFile = function (name, file) {
        const { type, lastModified, lastModifiedDate } = file;
        try {
          const blob = new Blob([file], { type });
          blob.name = name;
          blob.lastModified = lastModified || 0;
          blob.lastModifiedDate = lastModifiedDate || 0;
          return blob;
        } catch (e) {
          ___Log.warn(e.message);
          return f;
        }
      }

      this.readFile = function (file) {
        return new Promise(resolve => {
          const reader = new FileReader();
          const onLoad = (e) => {
            if (e.type === 'load') {
              resolve(e.target.result);
              reader.removeEventListener('load', onLoad);
            }
          };
          reader.addEventListener('load', onLoad);
          reader.readAsDataURL(file);
        });
      }

      this.fetch = function (arg = { url: null, param: {} }) {
        const { url, param } = arg;
        const path = url ?? this.getConfig('url.fetch');

        if (!path) {
          ___Log.throwError(Error, `Not found fetch url. Set 'url.fetch' in configuration or pass 'url' property in parameter`);
        }

        ___Ajax.get(path, param).then(files => {
          this.addFiles(files);
        }).catch((e) => {
          ___Log.error(e);
        });
      }

      this.getAddedCount = function () {
        return this._store.toArray().filter(({ isNew }) => isNew).length;
      }

      this.containsAddedFile = function () {
        return this.getAddedCount() > 0;
      }

      this.containsRemovedFile = function () {
        return this._removedIdStore.size() > 0;
      }

      this.getAddedFiles = function () {
        return this._store.toArray().filter(({ isNew }) => isNew).map(({ file }) => file);
      }

      this.getRemovedIds = function () {
        return this._removedIdStore.toArray();
      }

      this.freeze = function (obj) {
        const descriptor = {
          configurable: false,
          writable: false
        };
        const properties = Object.keys(obj).reduce((acc, key) => {
          acc[key] = descriptor;
          return acc;
        }, {});
        return Object.defineProperties(obj, properties);
      }

      this.initValidator = function (elementId) {
        const element = document.getElementById(elementId);
        
        if (!elementId) {
          ___Log.throwError(SyntaxError, 'The first parameter of the constructor is required.');
        }
        else if (!element) {
          ___Log.throwError(SyntaxError, `Not found element. '${elementId}'`);
        }
      }

      this.validateFileByShape = function (obj) {
        return ![
          ...Object.keys(__FileShape),
          ...this.getConfig('fileIds')
          ].every(key => Object.prototype.hasOwnProperty.call(obj, key));
      }

      this.validateFileByConfig = function (files) {
        let storeSize = this._store.size();

        for (const file of files) {

          storeSize += 1;

          const validator = this.getConfig('validate');
          const extention = file.name.split('.').pop();

          //추가할 파일의 크기와 파일크기제한 속성값 비교 (0이면 제한없음)
          if (validator.size > 0 && validator.size < file.size) {
            this.dispatchError('onError', this.errorType.VALIDATOR, this.getConfig('message.error.size_overflow'));
            return false;
          }

          //등록된 파일이 설정한 파일 개수보다 많은지 유효성 검증, 설정 개수가 0 이면 등록 개수 제한 없음
          if (validator.maxCount > 0 && validator.maxCount < storeSize) {
            this.dispatchError('onError', this.errorType.VALIDATOR, this.getConfig('message.error.count_overflow'));
            return false;
          }

          //허용된 확장자인지 체크 (허용된 확장자가 아니면 파일을 추가하지 않음)
          if (validator.includes.length > 0 && !validator.includes.includes(extention)) {
            this.dispatchError('onError', this.errorType.VALIDATOR, this.getConfig('message.error.invalid_extension'));
            return false;
          }

          //제외 확장자에 포함되는지 체크 (제외 확장자에 포함된다면 추가하지 않음)
          if (validator.excludes.length > 0 && validator.excludes.includes(extention)) {
            this.dispatchError('onError', this.errorType.VALIDATOR, this.getConfig('message.error.invalid_extension'));
            return false;
          }
        }

        return true;
      }

      this.destroy = function () {
        this.clear();
        this._store.destroy();
        this._removedIdStore.destroy();
        this._layout.destroy();
        for (let key in this) {
          if (key.startsWith('_')) {
            this[key] = null;
            delete this[key];
          }
        }
      }

      this.makeInterface = function () {
        return this.freeze({
          id: this._id,
          fetch: this.fetch.bind(this),
          getAddedCount: this.getAddedCount.bind(this),
          containsAdded: this.containsAddedFile.bind(this),
          containsRemoved: this.containsRemovedFile.bind(this),
          getAddedFiles: this.getAddedFiles.bind(this),
          getRemovedIds: this.getRemovedIds.bind(this),
          addFiles: this.addFiles.bind(this),
          clear: this.clear.bind(this),
          destroy: this.destroy.bind(this),
        });
      }
    }).call(FileAttacher.prototype);

    return {
      config: __setBaseConfig,
      create(id, options) {
        return new FileAttacher(id, options);
      }
    }
  }(



    (function LayoutFactory() {
      'use strict'

      const __eventType = {
        CLICK: 'click',
        INPUT: 'input',
        DRAG_START: 'dragstart',
        DRAG_END: 'dragend',
        DRAG_OVER: 'dragover',
        DRAG_ENTER: 'dragenter',
        DRAG_LEAVE: 'dragleave',
        DROP: 'drop',
        DOUBLE_CLICK: 'dblclick',
        ANIMATION_END: 'animationend',
      };

      const __notiType = {
        LINE: 'line',
        BOX: 'box',
      };

      const __messageType = {
        INFO: 'info',
        ERROR: 'error',
      };

      const __elementName = {
        MESSAGE: 'file_store_message',
        NOTIZONE: 'file_store_noti',
        INPUT: 'file_store_input',
        FRAME: 'file_store_frame',
      };

      function Layout() {
        this._$root = null;
        this._$dragging = null;
        this._frameEvents = null;
        this._inputEvents = null;
      }

      (function LayoutPrototype() {
        this.setRoot = function ($el) {
          this._$root = $el;
        }

        this.getRoot = function () {
          return this._$root;
        }

        this.getChild = function (name) {
          return this._$root.querySelector(`[name=${name}]`);
        }

        this.getFrame = function () {
          return this.getChild(__elementName.FRAME);
        }

        this.getInput = function () {
          return this.getChild(__elementName.INPUT);
        }

        this.getNotizone = function () {
          return this.getChild(__elementName.NOTIZONE);
        }

        this.getMessage = function () {
          return this.getChild(__elementName.MESSAGE);
        }

        this.setCurrentDraggingElement = function ($el) {
          this._$dragging = $el;
        }

        this.getCurrentDraggingElement = function () {
          return this._$dragging;
        }

        this.createFrame = function ({ scroll = true }) {
          const frame = document.createElement('div');
          frame.setAttribute('name', __elementName.FRAME);
          frame.classList.add('file-attacher-frame');

          if (!scroll) {
            frame.style.height = 'auto';
          }

          return frame;
        }

        this.createMessageZone = function ({ info: { introduce } }) {
          const message = document.createElement('div');
          message.setAttribute('name', __elementName.MESSAGE);
          message.classList.add('file-attacher-message');
          message.innerText = introduce;
          return message;
        }

        this.createNotificationZone = function () {
          const notizone = document.createElement('div');
          notizone.setAttribute('name', __elementName.NOTIZONE);
          notizone.classList.add('file-attacher-notizone');
          return notizone;
        }

        this.createNoti = function (notiType, messageType) {
          switch (notiType) {
            case __notiType.LINE:
              return this.createNotiLine(messageType);

            case __notiType.BOX:
              return this.createNotiBox(messageType);
          }
        }

        this.createNotiLine = function (messageType) {
          const noti = document.createElement('div');
          noti.classList.add('file-attacher-noti-line');

          switch (messageType) {
            case __messageType.INFO:
              noti.classList.add('info')
              break;

            case __messageType.ERROR:
              noti.classList.add('error')
              break;
          }
          return noti;
        }

        this.createNotiBox = function (messageType) {
          const notizone = this.getNotizone();
          notizone.classList.add('box');

          const noti = document.createElement('div');
          noti.classList.add('file-attacher-noti-box');

          switch (messageType) {
            case __messageType.INFO:
              noti.appendChild(this.createInfoIcon());
              break;

            case __messageType.ERROR:
              noti.appendChild(this.createErrorIcon());
              break;
          }
          return noti;
        }

        this.createInput = function () {
          const input = document.createElement('input');
          input.setAttribute('name', __elementName.INPUT);
          input.setAttribute('type', 'file');
          input.setAttribute('multiple', true);
          input.classList.add('file-attacher-hidden');
          return input;
        }

        this.createPreview = function (src, name, size, isNewFile) {
          const preview = document.createElement('div');
          preview.classList.add('file-attacher-preview', 'file-attacher-image-preview');
          preview.setAttribute('title', name);
          preview.setAttribute('alt', name);

          preview.appendChild(this.createImage(src));
          preview.appendChild(this.createDetail(name, size));

          const progress = this.createProgress();
          const successMark = this.createSuccessMark();

          const progressDuration = this.getDurationRandomRange(5, 13);
          progress.style.animationDuration = `${progressDuration}s`;
          successMark.style.animationDuration = `${progressDuration * 3}s`;

          preview.appendChild(progress);
          preview.appendChild(successMark);

          if (isNewFile) {
            preview.appendChild(this.createWillSavedMark());
          }

          return preview;
        }

        this.createDetail = function (name, size) {
          const detail = document.createElement('div');
          detail.classList.add('file-attacher-details');

          const sizeElement = this.createSize(size);
          const nameElement = this.createName(name);

          detail.appendChild(sizeElement);
          detail.appendChild(nameElement);
          return detail;
        }


        this.createImage = function (src) {
          const image = document.createElement('div');
          image.classList.add('file-attacher-image');

          const thumbnail = document.createElement('img');
          thumbnail.setAttribute('src', src);

          image.appendChild(thumbnail);
          return image;
        }

        this.createSize = function (size) {
          const sizeElement = document.createElement('div');
          sizeElement.classList.add('file-attacher-size');

          const sizeSpan = document.createElement('span');
          const sizeUnit = ' MB';

          const strong = document.createElement('strong');
          strong.innerText = (size / 1024 / 1024).toFixed(1);

          sizeElement.appendChild(sizeSpan);
          sizeSpan.appendChild(strong);
          sizeSpan.insertAdjacentText('beforeend', sizeUnit);
          return sizeElement;
        }

        this.createName = function (name) {
          const nameElement = document.createElement('div');
          nameElement.classList.add('file-attacher-name');

          const nameSpan = document.createElement('span');
          nameSpan.innerText = name;

          nameElement.appendChild(nameSpan);
          return nameElement;
        }

        this.createProgress = function () {
          const progress = document.createElement('div');
          progress.classList.add('file-attacher-progress');

          let listener = e => {
            e.target.classList.remove('file-attacher-progress');
            e.target.removeEventListener('animationend', listener);
            listener = null;
          }
          progress.addEventListener('animationend', listener);

          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('viewBox', '0 0 120 128');

          const load = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          load.classList.add('file-attacher-progress-load');
          load.setAttribute('cx', '64');
          load.setAttribute('cy', '64');
          load.setAttribute('r', '32');

          const bar = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          bar.classList.add('file-attacher-progress-bar');
          bar.setAttribute('cx', '64');
          bar.setAttribute('cy', '64');
          bar.setAttribute('r', '32');

          progress.appendChild(svg);
          svg.appendChild(load);
          svg.appendChild(bar);
          return progress;
        }

        this.showProgress = function($el) {
          $el.classList.add('file-attacher-progressing');
        }

        this.createSuccessMark = function () {
          const wrap = document.createElement('div');
          wrap.classList.add('file-attacher-success-mark');
          wrap.appendChild(this.createSuccessIcon());
          return wrap;
        }

        this.createWillSavedMark = function () {
          const mark = document.createElement('div');
          mark.classList.add('file-attacher-will-saved-mark');
          return mark;
        }

        this.createDownloadLink = function (name, url) {
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = name;
          anchor.target = '_blank';
          return anchor;
        }

        this.renderLayout = function (elementId, layoutConfig = {}, messageConfig = {}) {
          const root = document.getElementById(elementId);
          root.classList.add('file-attacher-container');

          const frame = this.createFrame(layoutConfig);
          const input = this.createInput();
          const notizone = this.createNotificationZone();
          const messagezone = this.createMessageZone(messageConfig);

          root.appendChild(notizone);
          root.appendChild(input);
          root.appendChild(frame);
          root.appendChild(messagezone);

          this.setRoot(root);

          return {
            $frame: frame,
            $input: input,
          }
        }

        this.removeEvents = function($el, events = {}) {
          for (let eventName in events) {
            $el.removeEventListener(eventName, events[eventName])
            delete events[eventName];
          }
        }

        this.bindPreviewEvent = function ($el) {
          $el.setAttribute('draggable', true);
          $el.addEventListener(__eventType.CLICK, e => {
            e.preventDefault();
            e.stopPropagation();
          });
          $el.addEventListener(__eventType.DOUBLE_CLICK, e => {
            e.preventDefault();
            e.stopPropagation();
          });
          $el.addEventListener(__eventType.DRAG_START, e => {
            this.setCurrentDraggingElement(e.target);
            this.startDrag(this.getFrame());
            this.startDrag(e.target);
            e.target.style.opacity = 0.2;
          });
          $el.addEventListener(__eventType.DRAG_END, e => {
            this.setCurrentDraggingElement(null);
            this.endDrag(this.getFrame());
            this.endDrag(e.target);
            e.target.style.opacity = 1;
          });
          $el.addEventListener(__eventType.DRAG_OVER, e => {
            if (e.target === this.getCurrentDraggingElement()) {
              return;
            }
            if (this.isInnerDragging()) {
              if (this.isPointOverHalfRight(e.x, e.y, e.target.offsetWidth, e.target.getBoundingClientRect())) {
                this.startOverHalfHoverOnDrag(e.target);
              }
              else {
                this.startUnderHalfHoverOnDrag(e.target);
              }
            }
          });
          $el.addEventListener(__eventType.DRAG_LEAVE, e => {
            if (this.isInnerDragging() && this.isHovering(e.target)) {
              this.endHoverOnDrag(e.target);
              this.endWidenSpace(e.target);
            }
          });
          $el.addEventListener(__eventType.DROP, e => {
            if (this.isInnerDragging() && this.isHovering(e.target)) {
              this.endHoverOnDrag(e.target);
              this.endWidenSpace(e.target);
            }
          });
          $el.addEventListener(__eventType.ANIMATION_END, e => {
            e.target.classList.remove('file-attacher-success-mark');
            e.target.remove();
          });
        }

        this.bindFrameEvent = function ($el) {
          $el.addEventListener(__eventType.CLICK, () => {
            this.getInput().click()
          });
          $el.addEventListener(__eventType.DRAG_OVER, e => {
            e.preventDefault();
            e.stopPropagation();
          });
          $el.addEventListener(__eventType.DRAG_START, () => {
            this.startDrag(this.getFrame());
          });
          $el.addEventListener(__eventType.DRAG_END, () => {
            this.endDrag(this.getFrame());
          });
          $el.addEventListener(__eventType.DRAG_ENTER, () => {
            if (!this.isInnerDragging()) {
              this.comeInDrag();
            }
          });
          $el.addEventListener(__eventType.DRAG_LEAVE, e => {
            if (this.isPointMoveOut(e.x, e.y)) {
              this.goOutDrag();
            }
          });
          $el.addEventListener(__eventType.DROP, e => {
            e.preventDefault();
            e.stopPropagation();
            this.goOutDrag();
          });
        }

        this.destroy = function () {
          this.removeEvents(this.getFrame(), this._frameEvents);
          this.removeEvents(this.getInput(), this._inputEvents);
          this.clearInFrame();
          this.getInput().remove();
          this.getFrame().remove();
          this.getNotizone().remove();
          this.getMessage().remove();
          this.getRoot().remove();
          this._$root = null;
          this._$dragging = null;
          this._frameEvents = null;
          this._inputEvents = null;
        }

        this.bindNotiEvent = function ($el) {
          function animationendListener(e) {
            e.target.classList.remove('show');
            e.target.removeEventListener('animationend', animationendListener);
            e.target.remove();
          };
          $el.addEventListener('animationend', animationendListener);
        }

        this.renderPreview = function ($el) {
          this.getFrame().appendChild($el);
        }

        this.removePreview = function ($el) {
          $el.remove();
        }

        this.changePreviewPosition = function ($from, $to) {
          this.removePreview($from);

          if ($to == null) {
            this.getFrame().appendChild($from);
          } else {
            this.getFrame().insertBefore($from, $to);
          }
        }

        this.printNoti = function (noti, message) {
          noti.insertAdjacentText('beforeend', message);
          noti.classList.add('show');
          this.bindNotiEvent(noti);
          this.getNotizone().appendChild(noti);
        }

        this.printNotiInfo = function (notiType, message) {
          this.printNoti(this.createNoti(notiType, __messageType.INFO), message);
        }

        this.printNotiError = function (notiType, message) {
          this.printNoti(this.createNoti(notiType, __messageType.ERROR), message);
        }

        this.clearInFrame = function () {
          const $frame = this.getFrame();
          let child = $frame.lastElementChild; 
          while (child) {
            $frame.removeChild(child);
            child = $frame.lastElementChild;
          }
        }

        this.isPointMoveOut = function (x, y) {
          const { left, right, top, bottom } = this.getFrame().getBoundingClientRect();
          return x < left || x > right || y < top || y > bottom;
        }

        this.isPointOverHalfRight = function (x, y, offsetWidth, clientRect) {
          const { left, right, top, bottom } = clientRect;
          return (
            x > left + offsetWidth / 2 &&
            x <= right + 62 &&
            y > top &&
            y < bottom
          );
        }

        this.preventEvent = function (e) {
          e.stopPropagation();
          e.preventDefault();
        }

        this.isInnerDragging = function () {
          return this.getFrame().classList.contains('dragging');
        }

        this.startDrag = function ($el) {
          $el.classList.add('dragging');
        }

        this.endDrag = function ($el) {
          $el.classList.remove('dragging');
        }

        this.comeInDrag = function () {
          this.getFrame().classList.add('dragging-comein');
        }

        this.goOutDrag = function () {
          this.getFrame().classList.remove('dragging-comein');
        }

        this.isHovering = function ($el) {
          return $el.classList.contains('half-under')  || $el.classList.contains('half-over');
        }

        this.endHoverOnDrag = function ($el) {
          $el.classList.remove('half-under', 'half-over');
        }

        this.startOverHalfHoverOnDrag = function ($el) {
          $el.classList.remove('half-under');
          $el.classList.add('half-over');
          this.widenSpaceBetweenNext($el);
        }

        this.startUnderHalfHoverOnDrag = function ($el) {
          $el.classList.remove('half-over');
          $el.classList.add('half-under');
          this.widenSpaceBetweenPrevious($el);
        }

        this.widenSpaceBetweenPrevious = function ($el) {
          this.endWidenSpace($el);
          $el.classList.add('widen-to-right');

          if ($el.previousSibling) {
            $el.previousSibling.classList.add('widen-to-left');
          }
        }

        this.widenSpaceBetweenNext = function ($el) {
          this.endWidenSpace($el);
          $el.classList.add('widen-to-left');

          if ($el.nextSibling) {
            $el.nextSibling.classList.add('widen-to-right');
          }
        }

        this.endWidenSpace = function ($el) {
          $el.classList.remove('widen-to-left', 'widen-to-right');

          if ($el.previousSibling) {
            $el.previousSibling.classList.remove('widen-to-left');  
          }
          if ($el.nextSibling) {
            $el.nextSibling.classList.remove('widen-to-right');
          }
        }

        const createIcon = (color, viewBox, d) => {
          const wrap = document.createElement('span');
          wrap.classList.add('file-attacher-message-icon');
  
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('viewBox', viewBox);
          svg.setAttribute('focusable', 'false');
          svg.setAttribute('wdith', '15px');
          svg.setAttribute('height', '15px');
          svg.setAttribute('fill', color);
  
          const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          iconPath.setAttribute('d', d);
  
          svg.appendChild(iconPath);
          wrap.appendChild(svg);
          return wrap;
        }
  
        this.createInfoIcon = () => {
          return createIcon('#52c41a', '0 0 480 480', 'M418.275,418.275c95.7-95.7,95.7-250.8,0-346.5s-250.8-95.7-346.5,0s-95.7,250.8,0,346.5S322.675,513.975,418.275,418.275z M157.175,207.575l55.1,55.1l120.7-120.6l42.7,42.7l-120.6,120.6l-42.8,42.7l-42.7-42.7l-55.1-55.1L157.175,207.575z');
        }
  
        this.createErrorIcon = () => {
          return createIcon('#ff4d4f', '64 64 900 900', 'M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm165.4 618.2l-66-.3L512 563.4l-99.3 118.4-66.1.3c-4.4 0-8-3.5-8-8 0-1.9.7-3.7 1.9-5.2l130.1-155L340.5 359a8.32 8.32 0 01-1.9-5.2c0-4.4 3.6-8 8-8l66.1.3L512 464.6l99.3-118.4 66-.3c4.4 0 8 3.5 8 8 0 1.9-.7 3.7-1.9 5.2L553.5 514l130 155c1.2 1.5 1.9 3.3 1.9 5.2 0 4.4-3.6 8-8 8z');
        }
  
        this.createSuccessIcon = () => {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('viewBox', '0 0 490.05 490.05');
          svg.setAttribute('y', '0px');
          svg.setAttribute('width', '54px');
          svg.setAttribute('height', '54px');
  
          const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          iconPath.setAttribute('d', 'M418.275,418.275c95.7-95.7,95.7-250.8,0-346.5s-250.8-95.7-346.5,0s-95.7,250.8,0,346.5S322.675,513.975,418.275,418.275z M157.175,207.575l55.1,55.1l120.7-120.6l42.7,42.7l-120.6,120.6l-42.8,42.7l-42.7-42.7l-55.1-55.1L157.175,207.575z');
          iconPath.setAttribute('stroke-opacity', '0.198794158');
          iconPath.setAttribute('fill-opacity', '0.816519475');
          iconPath.setAttribute('fill', '#FFFFFF');
  
          svg.appendChild(iconPath);
          return svg;
        }

        this.getDurationRandomRange = function (min, max) {
          min = Math.ceil(min);
          max = Math.floor(max);
          return (Math.floor(Math.random() * (max - min)) + min) / 10;
        }
      }).call(Layout.prototype)

      return {
        eventType: __eventType,
        create() {
          return new Layout();
        }
      };
    }()),



    (function DoublyLinkedMapFactory() {
      'use strict'

      function DoublyLinkedMap() {
        this.head = null;
        this.tail = null;
        this.map = Object.create(null);
        this.length = 0;
      }
      (function DoublyLinkedMapPrototype() {
        this.put = function (k, v) {
          const node = {
            key: k,
            value: v,
            prev: this.tail,
            next: null,
          };

          this.map[k] = node;

          if (this.length === 0) {
            this.head = node;
          }

          if (this.tail) {
            this.tail.next = node;
          }

          this.tail = node;
          this.length += 1;
        }

        this.remove = function (k) {
          const node = this.getNode(k);

          if (!node) {
            return;
          }

          if (this.isHead(node.key)) {
            if (node.next) {
              node.next.prev = null;
            }
            this.head = node.next;
          }

          if (this.isTail(node.key)) {
            if (node.prev) {
              node.prev.next = null;
            }
            this.tail = node.prev;
          }

          if (node.next) {
            node.next.prev = node.prev;
          }

          if (node.prev) {
            node.prev.next = node.next;
          }

          delete this.map[k];
          this.length -= 1;
        }

        this.changeNode = function (fromKey, toKey) {
          const fromNode = this.getNode(fromKey);

          if (!fromNode) {
            return;
          }

          if (fromKey === toKey) {
            return;
          }

          const toNode = this.getNode(toKey);
          if (!toNode) {
            return;
          }

          if (this.isHead(fromNode.key)) {
            fromNode.next.prev = null;
            this.head = fromNode.next;
          }

          if (this.isTail(fromNode.key)) {
            fromNode.prev.next = null;
            this.tail = fromNode.prev;
          }

          if (fromNode.prev) {
            fromNode.prev.next = fromNode.next;
          }

          if (fromNode.next) {
            fromNode.next.prev = fromNode.prev;
          }

          fromNode.prev = toNode.prev;
          fromNode.next = toNode;

          if (this.isHead(toNode.key)) {
            this.head = fromNode;
          }

          if (toNode.prev) {
            toNode.prev.next = fromNode
          }

          toNode.prev = fromNode;
        }

        this.clear = function () {
          this.head = null;
          this.tail = null;
          this.map = Object.create(null);
          this.length = 0;
        }
        
        this.destroy = function() {
          this.head = null;
          this.tail = null;
          this.map = null;
          this.length = null;
        }

        this.size = function () {
          return this.length;
        }

        this.get = function (k) {
          return this.getNode(k)?.value;
        }

        this.getNode = function (k) {
          return Object.prototype.hasOwnProperty.call(this.map, k) ? this.map[k] : null;
        }

        this.hasNext = function (k) {
          return this.getNode(k).next != null;
        }

        this.isHead = function (k) {
          return this.head === this.getNode(k);
        }

        this.isTail = function (k) {
          return this.tail === this.getNode(k);
        }

        this.getNextKey = function (k) {
          return this.hasNext(k) ? this.getNode(k).next.key : null;
        }

        this.contains = function (k) {
          return Object.prototype.hasOwnProperty.call(this.map, k);
        }

        this.change = function (fromKey, toKey) {
          if (fromKey === toKey) {
            return;
          }
          if (this.contains(toKey)) {
            this.changeNode(fromKey, toKey);
          } else {
            const fromValue = this.get(fromKey);
            this.remove(fromKey);
            this.put(fromKey, fromValue);
          }
        }

        this.each = function (callBack = () => false) {
          const
            len = this.length;

          let
            i = 0,
            param = null,
            node = this.head;

          while (i < len) {
            param = {
              key: node.key,
              value: node.value,
            };

            if (callBack(param, i) === false) {
              break;
            }

            node = node.next;
            i++;
          }
        }

        this.toArray = function () {
          const array = [];
          this.each(({ value }) => array.push(value));
          return array;
        }

        this.filter = function (callBack = () => false) {
          const array = [];
          this.each((param, i) => {
            if (callBack(param, i) === true) {
              array.push(param);
            }
          });
          return array;
        }
      }).call(DoublyLinkedMap.prototype);

      return {
        create() {
          return new DoublyLinkedMap();
        },
      };
    }()),



    (function Util() {
      'use strict'

      return {
        isObject(v) {
          return v != null && !Array.isArray(v) && typeof v === 'object';
        },
        isObjectOrArray(v) {
          return v != null && (Array.isArray(v) || typeof v === 'object');
        },
        find(object = {}, keyChain, defaultValue = null) {
          const keys = keyChain.split('.');
          let result = object;

          for (const k of keys) {
            if (result == null || !Object.prototype.hasOwnProperty.call(result, k) || result[k] == null) {
              result = defaultValue;
              break;
            }
            result = result[k];
          }

          return result;
        },
        setObject(obj, keyChain, v) {
          const keys = keyChain.split('.');
          const lastKey = keys.pop();

          for (const k of keys) {
            if (obj == null || !Object.prototype.hasOwnProperty.call(obj, k)) {
              obj[k] = {};
            }
            obj = obj[k];
          }

          if (this.isObjectOrArray(v)) {
            obj[lastKey] = Array.isArray(v) ? [...obj[lastKey], ...v] : { ...obj[lastKey], ...v };
          } else {
            obj[lastKey] = v;
          }
          obj = null;
          keyChain = null;
          v = null;
        },
        mergeMap(target, obj) {
          return this.copy(this.mergeObject(target, obj));
        },
        mergeArray(target = [], arr = []) {
          return [...target, ...arr];
        },
        mergeObject(target = {}, obj = {}) {
          return Object.entries(obj).reduce((acc, [k, v]) => {
            if (Array.isArray(v)) {
              acc[k] = this.mergeArray(acc[k], v);
            }
            else if (this.isObject(v)) {
              acc[k] = this.mergeObject(acc[k], v);
            }
            else {
              acc[k] = v;
            }
            return acc;
          }, target);
        },
        copy(obj) {
          if (Array.isArray(obj)) {
            return this.copyArray(obj);
          } else {
            return this.copyObject(obj);
          }
        },
        copyArray(arr = []) {
          return arr.map((v) => {
            if (Array.isArray(v)) {
              return this.copyArray(v);
            }
            else if (this.isObject(v)) {
              return this.copyObject(v);
            }
            else {
              return v;
            }
          });
        },
        copyObject(obj = {}) {
          return Object.entries(obj).reduce((acc, [k, v]) => {
            if (Array.isArray(v)) {
              acc[k] = this.copyArray(v);
            }
            else if (this.isObject(v)) {
              acc[k] = this.copyObject(v);
            }
            else {
              acc[k] = v;
            }
            return acc;
          }, {});
        },
      }
    }()),



    (function Ajax() {
      'use strict'

      return {
        get(url, param) {
          return this.xhr('GET', url, param, this.setJsonProp).then(({ data }) => data);
        },
        getFile(url) {
          return this.xhr('GET', url, null, this.setFileProp);
        },
        xhr(method, url, param, setPropFn) {
          return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            function onLoad(e) {
              const { readyState, status, response } = e.target;
              readyState == 4 && status == 200 ? resolve(response) : reject(xhr);
              xhr.removeEventListener('load', onLoad);
            }

            xhr.addEventListener('load', onLoad);

            xhr.onerror = function (e) {
              reject(e);
            };

            xhr.open(method, url, true);
            setPropFn(xhr);
            xhr.send(JSON.stringify(param));
          });
        },
        setJsonProp(xhr) {
          xhr.setRequestHeader('Content-type', 'application/json');
        },
        setFileProp(xhr) {
          xhr.responseType = 'blob';
        }
      }
    }()),



    (function Logger() {
      'use strict'

      const makeMessage = (msg) => `[FileAttacher] ${msg}`;

      return {
        throwError(error, msg) {
          throw new error(makeMessage(msg));
        },
        error(msg, ...args) {
          console.error(makeMessage(msg), ...args);
        },
        warn(msg, ...args) {
          console.warn(makeMessage(msg), ...args);
        },
      }
    }()),
  ))));