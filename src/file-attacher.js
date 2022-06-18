(function (factory) {
  if(typeof exports === 'object' && typeof module === 'object') {
    module.exports = factory();
  }
  else if(typeof define === 'function' && define.amd) {
    define([], factory);
  }
  else if(typeof exports === 'object') {
    exports["FileAttacher"] = factory();
  }
  else {
    window['FileAttacher'] = factory();
  }
}(
  (function FileAttacherFactory(___LayoutFactory, ___DoublyLinkedMapFactory, ___Util, ___Ajax, ___IconFactory, ___Log) {
    'use strict'

    const __LayoutFactory = ___LayoutFactory(___IconFactory);
    const __DoublyLinkedMapFactory = ___DoublyLinkedMapFactory();
    const __layoutEventType = __LayoutFactory.eventType;
    const __layoutNotiType = __LayoutFactory.notiType;
    const __storeMutationType = __DoublyLinkedMapFactory.mutationType;
    const __errorType = {
      VALIDATOR: 'validator',
      DOWNLOAD: 'download',
    }
    const __defaultConfig = {
      fileIds: [],
      url: {
        fetch: null,
      },
      layout: {
        scroll: true,
        noti: {
          use: true,
          type: __layoutNotiType.LINE,
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
      onBeforeAddAll: ({ target: files }) => null,
      onBeforeAdd: ({ target: file }) => null,
      onAdded: ({ target: file }) => null,
      onBeforeRemove: ({ target: file }) => null,
      onRemoved: ({ target: file }) => null,
      onBeforeChange: ({ target: file }) => null,
      onChanged: ({ target: file }) => null,
      onError: ({ type: errorType, message, target }) => null
    };

    const __getBaseConfig = function (keyChain) {
      return ___Util.find(__defaultConfig, keyChain);
    }

    const __setBaseConfig = function (customConfig) {
      let config;
      if (typeof customConfig === 'function') {
        config = customConfig();
      }
      else if (___Util.isObject(customConfig)) {
        config = customConfig;
      }
      else {
        ___Log.throwError(TypeError, `Config type must be 'function' or 'object'`);
      }
      ___Util.mergeObject(__defaultConfig, config);
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

      this._id = elementId;
      this._config = this.makeConfig(option);
      this._layout = __LayoutFactory.create();
      this._store = __DoublyLinkedMapFactory.create();
      this._removedIdStore = __DoublyLinkedMapFactory.create();
      this._state = {
        draggable: {
          currentKey: null,
        },
      };

      this.init();
      return this.makeInterface();
    }

    (function FileAttacherPrototype() {
      this.makeConfig = (option) => {
        return ___Util.mergeMap(__defaultConfig, option);
      }

      this.getConfig = function (keyChain) {
        return ___Util.find(this._config, keyChain);
      }

      this.getState = function (keyChain) {
        return ___Util.find(this._state, keyChain);
      }

      this.setState = function (keyChain, value) {
        ___Util.setObject(this._state, keyChain, value);
      }

      this.extractIdObject = function (obj) {
        return this.getConfig('fileIds').reduce((acc, key) => {
          if (___Util.hasProp(obj, key)) {
            acc[key] = obj[key];
          }
          return acc;
        }, {});
      }

      this.dispatchHook = async function (name, hookParam) {
        const isAllowGlobalHook = this.getConfig('hook.allowGlobal');
        const baseHook = __getBaseConfig(name);
        const hook = this.getConfig(name);

        if (isAllowGlobalHook && baseHook && await baseHook(hookParam) === false) {
          return false;
        }
        if (hook && baseHook !== hook && await hook(hookParam) === false) {
          return false;
        }
        return true;
      }

      this.dispatchLifeCycle = function (name, target, optionalParam = {}) {
        this.dispatchHook(name, { target, ...optionalParam });
      }

      this.dispatchError = function (name, type, message, target) {
        const { use: useNoti, type: notiType } = this.getConfig('layout.noti');
        if (useNoti) {
          this._layout.printNotiError(notiType, message);
        }
        this.dispatchHook(name, { type, message, target });
      }

      this.init = function () {
        this._layout
          .renderLayout(this._id, this.getConfig('layout'), this.getConfig('message'))
          .bindFrameEvent((...args) => this.frameEventListener(...args))
          .bindInputEvent((...args) => this.inputEventListener(...args));
        this._store.onMutate((...args) => this.storeObserver(...args));
      }

      this.storeObserver = async function (type, key, { target: file, toKey }) {
        if (type === __storeMutationType.PUT) {
          const [preview, showProgress] = this._layout.createPreview(file._src, file.name, file.size);

          this._layout
            .bindPreviewEvent(preview)
            .listen((...args) => this.previewEventListener(...args));

          preview._key = key;
          file._$element = preview;
          this._layout.addPreview(file._$element);

          if (file._isNew) {
            showProgress();
            await this.dispatchLifeCycle('onAdded', file);
          }
        }

        else if (type === __storeMutationType.REMOVE) {
          this._layout.removePreview(file._$element);
          await this.dispatchLifeCycle('onRemoved', file);
        }

        else if (type === __storeMutationType.CHANGE) {
          const toFile = this._store.get(toKey) ?? {};
          this._layout.changePreviewPosition(file._$element, toFile._$element);
          await this.dispatchLifeCycle('onChanged', file);
        }
      }

      this.addNewFiles = async function (files) {
        if (!this.validateFileByConfig(files)) {
          ___Log.error('Invalid file exists');
          return;
        }

        if (await this.dispatchLifeCycle('onBeforeAddAll', files) === false) {
          return;
        }

        Object.values(files).forEach(async file => {
          if (await this.dispatchLifeCycle('onBeforeAdd', file) === false) {
            return;
          }
          const name = this.generateName(file.name);
          const src = await this.readFile(file);
          const newFile = this.createNewFile(name, file);
          newFile._src = src;
          newFile._isNew = true;
          this._store.put(name, newFile);
        });
      }

      this.addFiles = function (files) {
        if (!this.validateFileByConfig(files)) {
          ___Log.warn('Could not add files because of exists invalid file');
          this.dispatchError('onError', __errorType.DOWNLOAD, this.getConfig('message.error.file_add'), file);
          return;
        }

        files.forEach(file => {
          if (this.validateFileByShape(file)) {
            ___Log.error('Could not add invalid file', file);
            this.dispatchError('onError', __errorType.DOWNLOAD, this.getConfig('message.error.file_add'), file);
            return;
          }
          if (this._store.contains(file.name)) {
            ___Log.error('Colud not add same name file', file);
            this.dispatchError('onError', __errorType.DOWNLOAD, this.getConfig('message.error.same_name'), file);
            return;
          }
          const newFile = this.extractIdObject(file);
          newFile.name = file.name;
          newFile.size = file.size
          newFile._src = file.src;
          newFile._isNew = false;
          this._store.put(newFile.name, newFile);
        });
      }

      this.removeFile = async function (key) {
        if (!this._store.contains(key)) {
          this.warn('File matching the key does not exist');
          return;
        }

        const file = this._store.get(key);

        if (await this.dispatchLifeCycle('onBeforeRemove', file) === false) {
          return;
        }

        this._store.remove(key);

        if (!file._isNew) {
          const fileIds = this.extractIdObject(file);
          this._removedIdStore.put(key, fileIds);
        }
      }

      this.changeFilePosition = async function (originKey, target, pointX, pointY) {
        const cursorTargetKey = target._key;
        let targetKey;

        if (!originKey || !cursorTargetKey) {
          return;
        }

        if (this._layout.isPointOverHalfRight({ x: pointX, y: pointY }, target)) {
          targetKey = this._store.getNextKey(cursorTargetKey);
        } else {
          targetKey = cursorTargetKey;
        }

        if (await this.dispatchLifeCycle('onBeforeChange', this._store.get(originKey), { to: this._store.get(targetKey) }) === false) {
          return;
        }
        
        this._store.change(originKey, targetKey);
      }

      this.downloadFile = async function (key) {
        const file = this._store.get(key);
        try {
          const { name, _src } = file;
          const blob = await ___Ajax.getFile(_src);
          const url = window.URL.createObjectURL(blob);
          this.downloadViaLink(name, url);
          window.URL.revokeObjectURL(url);

          const { use: useNoti, type: notiType } = this.getConfig('layout.noti');
          const message = this.getConfig('message.info.download');
          if (useNoti) {
            this._layout.printNotiInfo(notiType, message);
          }
        } catch (e) {
          ___Log.error(e.message);
          this.dispatchError('onError', __errorType.DOWNLOAD, this.getConfig('message.error.download'), file);
        }
      }

      this.downloadViaLink = function(name, url) {
        this._layout.createDownloadLink(name, url).click();
      }

      this.clear = function () {
        this._store.clear();
        this._removedIdStore.clear();
        this._layout.clearFrame();
      }

      this.frameEventListener = function (type, e) {
        switch (type) {
          case __layoutEventType.DRAG_END:
            if (this._layout.isPointMoveOutFrame({ x: e.x, y: e.y })) {
              this.removeFile(e.target._key);
            }
            break;

          case __layoutEventType.DROP:
            this.addNewFiles(e.dataTransfer.files);
            break;
        }
      }

      this.previewEventListener = async function (type, e) {
        switch (type) {
          case __layoutEventType.DRAG_START:
            this.setState('draggable.currentKey', e.target._key);
            break;

          case __layoutEventType.DRAG_END:
            this.setState('draggable.currentKey', null);
            break;

          case __layoutEventType.DROP:
            const originKey = this.getState('draggable.currentKey');
            if (originKey) {
              this.changeFilePosition(originKey, e.target, e.x, e.y);
            }
            break;

          case __layoutEventType.DOUBLE_CLICK:
            this.downloadFile(e.target._key);
            break;
        }
      }

      this.inputEventListener = function (type, e) {
        switch (type) {
          case __layoutEventType.INPUT:
            this.addNewFiles(e.target.files).finally(() => {
              e.target.value = null;
            })
            break;
        }
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
          const onLoad = (e) => e.type === 'load' && resolve(e.target.result);
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
        return this._store.filter(({ value }) => value._isNew).length;
      }

      this.containsAddedFile = function () {
        return this.getAddedCount() > 0;
      }

      this.containsRemovedFile = function () {
        return this._removedIdStore.size() > 0;
      }

      this.getAddedFiles = function () {
        return this._store.toArray().filter(({ _isNew }) => _isNew);
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
          ].every(key => ___Util.hasProp(obj, key));
      }

      this.validateFileByConfig = function (files) {
        let storeSize = this._store.size();

        for (const file of files) {

          storeSize += 1;

          const validator = this.getConfig('validate');
          const extention = file.name.split('.').pop();

          //추가할 파일의 크기와 파일크기제한 속성값 비교 (0이면 제한없음)
          if (validator.size > 0 && validator.size < file.size) {
            this.dispatchError('onError', __errorType.VALIDATOR, this.getConfig('message.error.size_overflow'), file);
            return false;
          }

          //등록된 파일이 설정한 파일 개수보다 많은지 유효성 검증, 설정 개수가 0 이면 등록 개수 제한 없음
          if (validator.maxCount > 0 && validator.maxCount < storeSize) {
            this.dispatchError('onError', __errorType.VALIDATOR, this.getConfig('message.error.count_overflow'), file);
            return false;
          }

          //허용된 확장자인지 체크 (허용된 확장자가 아니면 파일을 추가하지 않음)
          if (validator.includes.length > 0 && !validator.includes.includes(extention)) {
            this.dispatchError('onError', __errorType.VALIDATOR, this.getConfig('message.error.invalid_extension'), file);
            return false;
          }

          //제외 확장자에 포함되는지 체크 (제외 확장자에 포함된다면 추가하지 않음)
          if (validator.excludes.length > 0 && validator.excludes.includes(extention)) {
            this.dispatchError('onError', __errorType.VALIDATOR, this.getConfig('message.error.invalid_extension'), file);
            return false;
          }
        }

        return true;
      }

      this.makeInterface = function () {
        return this.freeze({
          id: this._id,
          fetch: ___Util.throttle(this.fetch).bind(this),
          getAddedCount: this.getAddedCount.bind(this),
          containsAdded: this.containsAddedFile.bind(this),
          containsRemoved: this.containsRemovedFile.bind(this),
          getAddedFiles: this.getAddedFiles.bind(this),
          getRemovedIds: this.getRemovedIds.bind(this),
          addFiles: this.addFiles.bind(this),
          clear: ___Util.debounce(this.clear).bind(this),
        });
      }
    }).call(FileAttacher.prototype);

    FileAttacher.config = __setBaseConfig;

    return function() {
      return FileAttacher;
    };
  }(



    (function LayoutFactory(___IconFactory) {
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

          return [noti, () => noti.classList.add('show')];
        }

        this.createNotiBox = function (messageType) {
          const notizone = this.getNotizone();
          notizone.classList.add('box');

          const noti = document.createElement('div');
          noti.classList.add('file-attacher-noti-box');

          switch (messageType) {
            case __messageType.INFO:
              noti.appendChild(___IconFactory.createInfoIcon());
              break;

            case __messageType.ERROR:
              noti.appendChild(___IconFactory.createErrorIcon());
              break;
          }

          return [noti, () => noti.classList.add('show')];
        }

        this.createInput = function () {
          const input = document.createElement('input');
          input.setAttribute('name', __elementName.INPUT);
          input.setAttribute('type', 'file');
          input.setAttribute('multiple', true);
          input.classList.add('file-attacher-hidden');
          return input;
        }

        this.createPreview = function (src, name, size) {
          const preview = document.createElement('div');
          preview.classList.add('file-attacher-preview', 'file-attacher-image-preview');
          preview.setAttribute('title', name);
          preview.setAttribute('alt', name);

          const image = this.createImage(src);
          const detail = this.createDetail(name, size);
          const progress = this.createProgress();
          const successMark = this.createSuccessMark();

          preview.appendChild(image);
          preview.appendChild(detail);
          preview.appendChild(progress);
          preview.appendChild(successMark);
          return [preview, () => preview.classList.add('file-attacher-progressing')];
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
          thumbnail.addEventListener('error', (e) => e.target.remove());
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

          const bar = document.createElement('span');
          bar.classList.add('file-attacher-bar');

          progress.appendChild(bar);
          return progress;
        }

        this.createSuccessMark = function () {
          const wrap = document.createElement('div');
          wrap.classList.add('file-attacher-success-mark');
          wrap.appendChild(___IconFactory.createSuccessIcon());
          return wrap;
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

          const result = {
            bindFrameEvent: (fn) => {
              this.bindFrameEvent(frame).listen(fn);
              return result;
            },
            bindInputEvent: (fn) => {
              this.bindInputEvent(input).listen(fn);
              return result;
            },
          }
          return result;
        }

        this.createEventListener = function (eventListener) {
          let onEvents = null;
          eventListener((...args) => onEvents && onEvents(...args));
          return {
            listen: function (fn) {
              onEvents = fn;
              return this;
            }.bind(this)
          }
        }

        this.bindFrameEvent = function ($el) {
          return this.createEventListener(onEvents => {
            $el.addEventListener('click', () => {
              this.getInput().click();
            });

            $el.addEventListener('dragover', (e) => {
              this.preventEvent(e);
            });

            $el.addEventListener(__eventType.DRAG_START, (e) => {
              this.startDrag(this.getFrame());
            });

            $el.addEventListener(__eventType.DRAG_END, (e) => {
              this.endDrag(this.getFrame());
              onEvents(__eventType.DRAG_END, e);
            });

            $el.addEventListener(__eventType.DRAG_ENTER, (e) => {
              if (!this.isInnerDragging()) {
                this.comeinDrag();
              }
            });

            $el.addEventListener(__eventType.DRAG_LEAVE, (e) => {
              if (this.isPointMoveOutFrame({ x: e.x, y: e.y })) {
                this.gooutDrag();
              }
            });

            $el.addEventListener(__eventType.DROP, (e) => {
              this.preventEvent(e);
              this.gooutDrag();
              onEvents(__eventType.DROP, e);
            });
          });
        }

        this.bindInputEvent = function ($el) {
          return this.createEventListener(onEvents => {
            $el.addEventListener(__eventType.INPUT, (e) => {
              onEvents(__eventType.INPUT, e);
            });
          });
        }

        this.bindPreviewEvent = function ($el) {
          return this.createEventListener(onEvents => {
            $el.setAttribute('draggable', true);

            $el.addEventListener('click', (e) => this.preventEvent(e));

            $el.addEventListener(__eventType.DOUBLE_CLICK, (e) => {
              this.preventEvent(e);
              onEvents(__eventType.DOUBLE_CLICK, e);
            });

            $el.addEventListener(__eventType.DRAG_START, (e) => {
              e.dataTransfer.effectAllowed = 'move';
              this.setCurrentDraggingElement(e.target);
              this.startDrag(this.getFrame());
              this.startDrag(e.target);
              e.target.style.opacity = 0.2;
              onEvents(__eventType.DRAG_START, e);
            });

            $el.addEventListener(__eventType.DRAG_END, (e) => {
              this.setCurrentDraggingElement(null);
              this.endDrag(this.getFrame());
              this.endDrag(e.target);
              e.target.style.opacity = 1;
              onEvents(__eventType.DRAG_END, e);
            });

            $el.addEventListener(__eventType.DRAG_OVER, (e) => {
              if (e.target === this.getCurrentDraggingElement()) {
                return;
              }
              
              if (this.isInnerDragging()) {
                if (this.isPointOverHalfRight({ x: e.x, y: e.y }, e.target)) {
                  this.startOverHalfHoverOnDrag(e.target);
                }
                else {
                  this.startUnderHalfHoverOnDrag(e.target);
                }
              }
            });

            $el.addEventListener(__eventType.DRAG_LEAVE, (e) => {
              if (this.isInnerDragging() && this.isHovering(e.target)) {
                this.endHoverOnDrag(e.target);
                this.endWidenSpace(e.target);
              }
            });

            $el.addEventListener(__eventType.DROP, (e) => {
              if (this.isInnerDragging() && this.isHovering(e.target)) {
                this.endHoverOnDrag(e.target);
                this.endWidenSpace(e.target);
              }
              onEvents(__eventType.DROP, e);
            });

            $el.addEventListener('animationend', (e) => this.progressAnimationEndEventListener($el, e));
          });
        }

        this.bindNotiEvent = function ($el) {
          $el.addEventListener('animationend', (e) => this.notizoneAnimationEndEventListener(e));
        }

        this.progressAnimationEndEventListener = function ($target, e) {
          switch (e.animationName) {
            case 'add-file-progress':
              $target.classList.add('file-attacher-complete');
              break;
              
            case 'passing-through':
              e.target.classList.add('file-attacher-success');
              break;
          }
        }

        this.notizoneAnimationEndEventListener = function (e) {
          switch (e.animationName) {
            case 'show-message-line':
              e.target.remove();
              break;

            case 'show-message-box':
              e.target.remove();
              break;
          }
        }

        this.addPreview = function ($el) {
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

        this.printNoti = function ([noti, showNoti], message) {
          noti.insertAdjacentText('beforeend', message);
          showNoti();
          this.bindNotiEvent(noti);
          this.getNotizone().appendChild(noti);
        }

        this.printNotiInfo = function (notiType, message) {
          this.printNoti(this.createNoti(notiType, __messageType.INFO), message);
        }

        this.printNotiError = function (notiType, message) {
          this.printNoti(this.createNoti(notiType, __messageType.ERROR), message);
        }

        this.clearFrame = function () {
          this.getFrame().innerHTML = null;
        }

        this.isPointMoveOutFrame = function (point) {
          return this.isPointMoveOut(point, this.getFrame());
        }

        this.isPointMoveOut = function (point, $compare) {
          const { x, y } = point;
          const { left, right, top, bottom } = $compare.getBoundingClientRect();
          return x < left || x > right || y < top || y > bottom;
        }

        this.isPointOverHalfRight = function (point, $compare) {
          const { x, y } = point;
          const { left, right, top, bottom } = $compare.getBoundingClientRect();
          return (
            x > left + $compare.offsetWidth / 2 &&
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

        this.comeinDrag = function () {
          this.getFrame().classList.add('dragging-comein');
        }

        this.gooutDrag = function () {
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
      }).call(Layout.prototype)

      return {
        notiType: __notiType,
        eventType: __eventType,
        create() {
          return new Layout();
        }
      };
    }),



    (function DoublyLinkedMapFactory() {
      'use strict'

      const __mutationType = {
        PUT: 'put',
        REMOVE: 'remove',
        CHANGE: 'change',
      }

      function DoublyLinkedMap() {
        this.head = null;
        this.tail = null;
        this.map = Object.create(null);
        this.length = 0;
        this.mutateObserver = null;

        return this.makeInterface();
      }
      (function DoublyLinkedMapPrototype() {
        this.mutate = function (...args) {
          if (this.mutateObserver && typeof this.mutateObserver === 'function') {
            this.mutateObserver(...args);
          }
        }

        this.putNode = function (k, v) {
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
          return node;
        }

        this.removeNode = function (k) {
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
          return node;
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
          return fromNode;
        }

        this.onMutate = function (fn) {
          this.mutateObserver = fn;
        }

        this.clear = function () {
          this.head = null;
          this.tail = null;
          this.map = Object.create(null);
          this.length = 0;
        }

        this.size = function () {
          return this.length;
        }

        this.get = function (k) {
          const node = this.getNode(k);
          return node ? node.value : null;
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

        this.put = function putNodeProxy(k, v) {
          this.removeNode(k);
          const node = this.putNode(k, v);
          this.mutate(__mutationType.PUT, k, { target: node.value });
        }

        this.remove = function removeNodeProxy(k) {
          const node = this.removeNode(k);
          this.mutate(__mutationType.REMOVE, k, { target: node.value });
        }

        this.change = function changeNodeProxy(fromKey, toKey) {
          if (fromKey === toKey) {
            return;
          }

          let node;
          if (this.contains(toKey)) {
            node = this.changeNode(fromKey, toKey);
          } else {
            const fromValue = this.get(fromKey);
            this.removeNode(fromKey);
            node = this.putNode(fromKey, fromValue);
          }
          this.mutate(__mutationType.CHANGE, fromKey, { target: node.value, toKey });
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

        this.makeInterface = function () {
          return {
            onMutate: this.onMutate.bind(this),
            clear: this.clear.bind(this),
            size: this.size.bind(this),
            get: this.get.bind(this),
            getNextKey: this.getNextKey.bind(this),
            contains: this.contains.bind(this),
            put: this.put.bind(this),
            change: this.change.bind(this),
            remove: this.remove.bind(this),
            each: this.each.bind(this),
            toArray: this.toArray.bind(this),
            filter: this.filter.bind(this),
          }
        }
      }).call(DoublyLinkedMap.prototype);

      return {
        mutationType: __mutationType,
        create() {
          return new DoublyLinkedMap();
        },
      };
    }),



    (function Util() {
      'use strict'

      return {
        hasProp(obj, key) {
          return Object.prototype.hasOwnProperty.call(obj, key);
        },
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
            if (result == null || !this.hasProp(result, k) || result[k] == null) {
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
            if (obj == null || !this.hasProp(obj, k)) {
              obj[k] = {};
            }
            obj = obj[k];
          }

          if (this.isObjectOrArray(v)) {
            obj[lastKey] = Array.isArray(v) ? [...obj[lastKey], ...v] : { ...obj[lastKey], ...v };
          } else {
            obj[lastKey] = v;
          }
        },
        mergeMap(target, obj) {
          return this.mergeObject(this.copy(target), this.copy(obj));
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
        debounce(fn, sleep = 0) {
          let debounceFn = null;
          return function (...args) {
            window.clearTimeout(debounceFn);
            debounceFn = window.setTimeout(() => fn.apply(this, args), sleep);
          };
        },
        throttle(fn, sleep = 1000) {
          let running = false;
          return function (...args) {
            if (!running) {
              running = true;
              fn.apply(this, args);
              setTimeout(() => running = false, sleep);
            }
          }
        }
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

            xhr.onload = (e) => {
              const { readyState, status, response } = e.target;
              readyState == 4 && status == 200 ? resolve(response) : reject(xhr);
            }

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

    (function IconFactory() {
      'use strict'

      const createIcon = (color, d) => {
        const wrap = document.createElement('span');
        wrap.classList.add('file-attacher-message-icon');

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '64 64 896 896');
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

      const createInfoIcon = () => {
        return createIcon('#52c41a', 'M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm193.5 301.7l-210.6 292a31.8 31.8 0 01-51.7 0L318.5 484.9c-3.8-5.3 0-12.7 6.5-12.7h46.9c10.2 0 19.9 4.9 25.9 13.3l71.2 98.8 157.2-218c6-8.3 15.6-13.3 25.9-13.3H699c6.5 0 10.3 7.4 6.5 12.7z');
      }

      const createErrorIcon = () => {
        return createIcon('#ff4d4f', 'M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm165.4 618.2l-66-.3L512 563.4l-99.3 118.4-66.1.3c-4.4 0-8-3.5-8-8 0-1.9.7-3.7 1.9-5.2l130.1-155L340.5 359a8.32 8.32 0 01-1.9-5.2c0-4.4 3.6-8 8-8l66.1.3L512 464.6l99.3-118.4 66-.3c4.4 0 8 3.5 8 8 0 1.9-.7 3.7-1.9 5.2L553.5 514l130 155c1.2 1.5 1.9 3.3 1.9 5.2 0 4.4-3.6 8-8 8z');
      }

      const createSuccessIcon = () => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '54px');
        svg.setAttribute('height', '54px');

        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('fill-rule', 'evenodd');

        const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        iconPath.setAttribute('d', 'M23.5,31.8431458 L17.5852419,25.9283877 C16.0248253,24.3679711 13.4910294,24.366835 11.9289322,25.9289322 C10.3700136,27.4878508 10.3665912,30.0234455 11.9283877,31.5852419 L20.4147581,40.0716123 C20.5133999,40.1702541 20.6159315,40.2626649 20.7218615,40.3488435 C22.2835669,41.8725651 24.794234,41.8626202 26.3461564,40.3106978 L43.3106978,23.3461564 C44.8771021,21.7797521 44.8758057,19.2483887 43.3137085,17.6862915 C41.7547899,16.1273729 39.2176035,16.1255422 37.6538436,17.6893022 L23.5,31.8431458 Z M27,53 C41.3594035,53 53,41.3594035 53,27 C53,12.6405965 41.3594035,1 27,1 C12.6405965,1 1,12.6405965 1,27 C1,41.3594035 12.6405965,53 27,53 Z');
        iconPath.setAttribute('stroke-opacity', '0.198794158');
        iconPath.setAttribute('fill-opacity', '0.816519475');
        iconPath.setAttribute('fill', '#FFFFFF');

        svg.appendChild(group);
        group.appendChild(iconPath);
        return svg;
      }

      return {
        createInfoIcon,
        createErrorIcon,
        createSuccessIcon,
      };

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