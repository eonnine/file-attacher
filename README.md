<sup>※ markdown으로 작성되었습니다. md viewer plugin을 사용하거나 https://github.com/eonnine/file-attacher#fileattacher 에서 확인하세요</sup>

# FileAttacher

### [Demo](https://eonnine.github.io/file-attacher/)

## Install
```
$ npm i --save-dev file-attacher
```

## Usage
```javascript
import FileAttacher from 'file-attacher';
```

## Not use a package manager
```html
<script src="./src/file-attacher.js"></script>
<link href="./src/file-attacher.css" rel="stylesheet" type="text/css"/>

<div id="app"></div>

<script>
    const attacher = FileAttacher.create('app');
</script>
```

## Configuration

```typescript
 // global
const baseOption = {...};
FileAttacher.config(baseOption);

 // local
const localOption = {...};
const attacher = FileAttacher.create('element id', {...});
```
- 전역 설정은 모든 'FileAttacher'을 사용할 때 적용되며 각 인스턴스 생성 시 [option](https://github.com/eonnine/file-attacher#option)객체를 통해 '재정의'할 수 있습니다.
- 단, 'Hook'은 Global Hook이 호출된 후 Local Hook이 실행되는 것에 주의합니다.

<br/>

## Option
|prop                              |type               |description        |default|
|:---------------------------------|:------------------|:------------------|:------|
|fileIds                           |```Array<String>```|파일의 식별자를 지정합니다. <br/> 예를 들어, DataBase의 기본키가 있습니다.[getRemovedIds](https://github.com/eonnine/file-attacher#api)로  삭제한 파일 식별자를 가져올 때, 이 속성에 정의한 필드에 매핑된 식별자 정보가 반환됩니다.|[]
|readonly                          |```Boolean```      | 읽기 전용 모드를 사용합니다. <br/> 다운로드만 가능합니다.|false
|xhr.configure                     |```Function```     |header등 xhr 통신에 관한 옵션을 설정합니다.| null
|url.fetch                         |```String```       |파일 목록을 가져올 URL|null
|layout.scroll                     |```Boolean```      |파일 목록이 줄바꿈될 때 영역을 고정하고 스크롤을 생성할 지 여부입니다. 'false'일 때 스크롤이 생성되는 대신 영역이 확장됩니다.|true
|layout.noti.use                   |```Boolean```      |알림 메세지가 상황에 맞게 자동 출력될 지 여부를 지정합니다. <br/> Hook을 이용하여 메세지를 직접 핸들링 할 수 있습니다.|true
|layout.noti.type                  |```String```       |알림 메세지가 출력되는 방식을 지정합니다. <br/> `type: ['line','box']`|'box'
|hook.allowGlobal                  |```Boolean```      |[config](https://github.com/eonnine/file-attacher#configuration)로 정의한 Global Hook을 LifeCycle에 포함할 지 결정합니다.|true
|validate.size                     |```Number```       |허용할 파일의 최대 크기(byte)를 정의합니다.|52428800
|validate.maxCount                 |```Number```       |등록할 수 있는 파일의 최대 개수를 정의합니다.|20
|validate.includes                 |```Array<String>```|허용할 파일의 확장자를 정의합니다.|[]
|validate.excludes                 |```Array<String>```|제외할 파일의 확장자를 정의합니다.|[]
|message.info.introduce            |```String```    |생성된 'FileAttacher'영역에 노출되는 기본 메세지를 지정합니다.|'첨부할 파일들 드래그하세요'
|message.info.download             |```String```    |파일 다운로드가 완료되었을 때 보여지는 메세지입니다.|'다운로드가 완료되었습니다'
|message.error.size_overflow       |```String```    |'validator.file.size'보다 큰 파일을 등록하려 할 경우 보여지는 메세지입니다.|'허용된 크기보다 용량이 큰 파일이 포함되어 있습니다'
|message.error.count_overflow      |```String```    |'validator.file.maxCount'보다 많은 파일을 등록하려 할 경우 보여지는 메세지입니다.|'허용된 개수를 초과하였습니다'
|message.error.invalid_extension   |```String```    |확장자가 'validator.file.includes'에 포함되지 않거나 'validator.fiel.excludes'에 포함되는 파일을 등록하려 할 경우 보여지는 메세지입니다.|'허용되지 않은 파일 확장자가 포함되어 있습니다'
|message.error.download            |```String```    |파일 다운로드 도중 예외가 발생했을 때 보여지는 메세지입니다.|'다운로드 중 오류가 발생했습니다'
|message.error.file_add            |```String```    |파일 추가 도중 예외가 발생했을 때 보여지는 메세지입니다.|'파일 추가 중 오류가 발생했습니다'
|message.error.same_name           |```String```    |동일한 이름의 파일을 추가하려고 할 때 보여지는 메세지입니다. <br/> 기존에 저장된 파일을 가져오거나 [addFiles](https://github.com/eonnine/file-attacher#api)를 통해 파일을 추가할 때 적용됩니다. <br/> 새로운 파일을 추가할 때는 동일한 이름의 파일이 존재할 경우, 파일명에 넘버링이 자동으로 부여됩니다.|'동일한 이름의 파일이 존재합니다'
||||
|Hook                              |                |'this'를 통해 자신의 인스턴스에 접근할 수 있습니다.
|onError                           |```Function```  |에러 발생 시 실행됩니다. 인자 객체에 에러 관련 정보가 전달됩니다. <br/> `type: ['validator', 'download']` |({ <br/>&nbsp; type: 에러 타입, <br/>&nbsp; message: 에러 메시지, <br/> }) => null

## API
- 생성된 FileAttacher 인스턴스에서 제공되는 API입니다.
  
|name            |type          |descrption  |parameter|
|----------------|--------------|------------|---------|
|id              |```String```  |Element Id  |         |
|fetch           |```Function```|파라미터 객체에 url이 없을 시 [url.fetch](https://github.com/eonnine/file-attacher#option)에 등록된 URL에서 파일 목록을 가져옵니다.|{ url: String, param: Object }
|getAddedCount   |```Function```|현재 새로 추가된 파일의 개수를 가져옵니다.
|containsAdded   |```Function```|새로 추가된 파일이 존재하는지 여부를 반환합니다.
|containsRemoved |```Function```|삭제한 파일이 존재하는지 여부를 반환합니다. 새로 추가한 파일은 대상에 포함되지 않습니다.
|getAddedFiles   |```Function```|새로 추가한 파일들을 Array로 가져옵니다.
|getRemovedIds   |```Function```|삭제된 파일들의 id값들을 Array로 가져옵니다. <br/> 각 요소는 [fileIds](https://github.com/eonnine/file-attacher#option)에서 정의한 필드에 따라 생성됩니다.
|addFiles        |```Function```|[알맞은 구조를 가진 파일 객체](https://github.com/eonnine/file-attacher#file)들을 목록에 추가합니다. 이 메서드를 통해 추가된 파일은 새 파일이 아닌 기존에 저장된 파일로 취급됩니다.|Array<[File](https://github.com/eonnine/file-attacher#file)>
|clear           |```Function```|FilAttacher를 초기화합니다.
|destroy         |```Function```|FilAttacher를 제거합니다.
|readonly        |```Function```|읽기 전용 모드로 변경합니다.
|enable          |```Function```|모든 기능을 사용할 수 있도록 변경합니다.


## File
- FileAttacher에서 사용되는 File객체의 구조입니다.
```typescript
File {
    name: String,
    type: String, // ex) image/png
    size: Number,
    src: String, // file path | file Data URIs
    fileIds...
}
```
