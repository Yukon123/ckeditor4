var powerPaste = {
    image(html, editor, rtf) {
        var imgTags;

        // If the editor does not allow images, skip embedding.
        if (editor.activeFilter && !editor.activeFilter.check('img[src]')) {
            return html;
        }

        imgTags = extractTagsFromHtml(html);

        if (imgTags.length === 0) {
            return html;
        }

        if (rtf) {
            return powerPaste.handleRtfImages(html, rtf, imgTags);
        }

        return ''
        // return handleBlobImages(editor, html, imgTags);

        function extractTagsFromHtml(html) {
            var regexp = /<img[^>]+src="([^"]+)[^>]+/g,
                ret = [],
                item;

            while (item = regexp.exec(html)) {
                ret.push(item[1]);
            }

            return ret;
        }
    },

    /* 处理八进制富文本数据图片 */
    handleRtfImages(html, rtf, imgTags) {
        var hexImages = this.extractFromRtf(rtf),
            newSrcValues,
            i;

        if (hexImages.length === 0) {
            return html;
        }
        newSrcValues = hexImages.map((img) => this.createSrcWithBase64(img));

        if (imgTags.length !== newSrcValues.length) {
            CKEDITOR.error('pastetools-failed-image-extraction', {
                rtf: hexImages.length,
                html: imgTags.length
            });

            return html;
        }

        // Assuming there is equal amount of Images in RTF and HTML source, so we can match them accordingly to the existing order.
        for (i = 0; i < imgTags.length; i++) {
            // Replace only `file` urls of images ( shapes get newSrcValue with null ).
            if (imgTags[i].indexOf('file://') === 0) {
                if (!newSrcValues[i]) {
                    CKEDITOR.error('pastetools-unsupported-image', {
                        type: hexImages[i].type,
                        index: i
                    });

                    continue;
                }

                // In Word there is a chance that some of the images are also inserted via VML.
                // This regex ensures that we replace only HTML <img> tags.
                // Oh, and there are also Windows paths that need to be escaped
                // before passing to regex.
                var escapedPath = imgTags[i].replace(/\\/g, '\\\\'),
                    imgRegex = new RegExp('(<img [^>]*src=["\']?)' + escapedPath);

                html = html.replace(imgRegex, '$1' + newSrcValues[i]);
            }
        }

        return html;
    },
    /* 图片的src转为base64 */
    createSrcWithBase64(img) {
        var isSupportedType = ['image/png', 'image/jpeg', 'image/gif'].indexOf(img.type) !== -1,
            data = img.hex;

        if (!isSupportedType) {
            return null;
        }

        if (typeof data === 'string') {
            data = convertHexStringToBytes(img.hex);
        }

        return img.type ? 'data:' + img.type + ';base64,' + convertBytesToBase64(data) : null;

        /* 把八进制字符串转换成二进制数组 */
        function convertHexStringToBytes(hexString) {
            // 将十六进制字符串分割为每两个字符一组，并转换为字节数组
            const bytesArray = Array.from(hexString.match(/.{1,2}/g), byte => parseInt(byte, 16));
            return bytesArray;
            // var bytesArray = [],
            // 	bytesArrayLength = hexString.length / 2,
            // 	i;

            // for (i = 0; i < bytesArrayLength; i++) {
            // 	bytesArray.push(parseInt(hexString.substr(i * 2, 2), 16));
            // }
            // return bytesArray;
        }

        /* 把二进制字节流转换成base64 */
        function convertBytesToBase64(bytesArray) {
            // 将字节数组转换为一个有效的 UTF-8 字符串
            var utf8String = String.fromCharCode.apply(null, bytesArray);

            // 使用 btoa 函数将 UTF-8 字符串转换为 Base64 编码的字符串
            var base64String = btoa(utf8String);

            return base64String;
            // Bytes are `8bit` numbers, where base64 use `6bit` to store data. That's why we process 3 Bytes into 4 characters representing base64.
            //
            // Algorithm:
            // 1. Take `3 * 8bit`.
            // 2. If there is less than 3 bytes, fill empty bits with zeros.
            // 3. Transform `3 * 8bit` into `4 * 6bit` numbers.
            // 4. Translate those numbers to proper characters related to base64.
            // 5. If extra zero bytes were added fill them with `=` sign.
            //
            // Example:
            // 1. Bytes Array: [ 8, 161, 29, 138, 218, 43 ] -> binary: `0000 1000 1010 0001 0001 1101 1000 1010 1101 1010 0010 1011`.
            // 2. Binary: `0000 10|00 1010| 0001 00|01 1101| 1000 10|10 1101| 1010 00|10 1011` ← `|` (pipe) shows where base64 will cut bits during transformation.
            // 3. Now we have 6bit numbers (written in decimal values), which are translated to indexes in `base64characters` array.
            //    Decimal: `2 10 4 29 34 45 40 43` → base64: `CKEditor`.
            var base64characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
                base64string = '',
                bytesArrayLength = bytesArray.length,
                i;

            for (i = 0; i < bytesArrayLength; i += 3) {
                var array3 = bytesArray.slice(i, i + 3),
                    array3length = array3.length,
                    array4 = [],
                    j;

                if (array3length < 3) {
                    for (j = array3length; j < 3; j++) {
                        array3[j] = 0;
                    }
                }

                // 0xFC -> 11111100 || 0x03 -> 00000011 || 0x0F -> 00001111 || 0xC0 -> 11000000 || 0x3F -> 00111111
                array4[0] = (array3[0] & 0xFC) >> 2;
                array4[1] = ((array3[0] & 0x03) << 4) | (array3[1] >> 4);
                array4[2] = ((array3[1] & 0x0F) << 2) | ((array3[2] & 0xC0) >> 6);
                array4[3] = array3[2] & 0x3F;

                for (j = 0; j < 4; j++) {
                    // Example: if array3length == 1, then we need to add 2 equal signs at the end of base64.
                    // array3[ 0 ] is used to calculate array4[ 0 ] and array4[ 1 ], so there will be regular values,
                    // next two ones have to be replaced with `=`, because array3[ 1 ] and array3[ 2 ] wasn't present in the input string.
                    if (j <= array3length) {
                        base64string += base64characters.charAt(array4[j]);
                    } else {
                        base64string += '=';
                    }
                }

            }
            return base64string;
        }
    },


    extractFromRtf(rtfContent) {
        var filter = CKEDITOR.plugins.pastetools.filters.common.rtf,
            ret = [],
            wholeImages;

        // Remove headers, footers, non-Word images and drawn objects.
        // Headers and footers are in \header* and \footer* groups,
        // non-Word images are inside \nonshp groups.
        // Drawn objects are inside \shprslt and could be e.g. image alignment.
        rtfContent = removeGroups(rtfContent, '(?:(?:header|footer)[lrf]?|nonshppict|shprslt)');
        wholeImages = getGroups(rtfContent, 'pict');
        // debugger;
        if (!wholeImages) {
            return ret;
        }

        for (var i = 0; i < wholeImages.length; i++) {
            var currentImage = wholeImages[i].content,
                imageId = getImageId(currentImage),
                imageType = getImageType(currentImage),
                imageDataIndex = getImageIndex(imageId),
                isAlreadyExtracted = imageDataIndex !== -1 && ret[imageDataIndex].hex,
                // If the same image is inserted more then once, the same id is used.
                isDuplicated = isAlreadyExtracted && ret[imageDataIndex].type === imageType,
                // Sometimes image is duplicated with another format, especially if
                // it's right after the original one (so, in other words, original is the last image extracted).
                isAlternateFormat = isAlreadyExtracted && ret[imageDataIndex].type !== imageType &&
                    imageDataIndex === ret.length - 1,
                // WordArt shapes are defined using \defshp control word. Thanks to that
                // they can be easily filtered.
                isWordArtShape = currentImage.indexOf('\\defshp') !== -1,
                isSupportedType = CKEDITOR.tools.array.indexOf(CKEDITOR.pasteFilters.image.supportedImageTypes, imageType) !== -1,
                isHorizontalLine = CKEDITOR.tools.indexOf(currentImage, 'fHorizRule') !== -1;
            // debugger;
            if (isDuplicated) {
                ret.push(ret[imageDataIndex]);

                continue;
            }

            if (isAlternateFormat || isWordArtShape) {
                continue;
            }

            // Continue when the element is a <hr> line to allow paste image with horizontal line. (#4873)
            if (isHorizontalLine) {
                continue;
            }

            var newImageData = {
                id: imageId,
                hex: isSupportedType ? getImageContent(currentImage) : null,
                type: imageType
            };

            if (imageDataIndex !== -1) {
                ret.splice(imageDataIndex, 1, newImageData);
            } else {
                ret.push(newImageData);
            }
        }

        return ret;

        function getImageIndex(id) {
            // In some cases LibreOffice does not include ids for images.
            // In that case, always treat them as unique (not found in the array).
            if (typeof id !== 'string') {
                return -1;
            }

            return CKEDITOR.tools.array.indexOf(ret, function (image) {
                return image.id === id;
            });
        }

        function getImageId(image) {
            var blipUidRegex = /\\blipuid (\w+)\}/,
                blipTagRegex = /\\bliptag(-?\d+)/,
                blipUidMatch = image.match(blipUidRegex),
                blipTagMatch = image.match(blipTagRegex);

            if (blipUidMatch) {
                return blipUidMatch[1];
            } else if (blipTagMatch) {
                return blipTagMatch[1];
            }

            return null;
        }

        // Image content is basically \pict group content. However RTF sometimes
        // break content into several lines and we don't want any whitespace
        // in our images. So we need to get rid of it.
        function getImageContent(image) {
            var content = extractGroupContent(image);
            return content.replace(/\s/g, '');
            /* 提取组数据 */
            function extractGroupContent(group) {
                // debugger;
                var groupName = getGroupName(group),
                    controlWordsRegex = /^\{(\\[\w-]+\s*)+/g,
                    // Sometimes content follows the last subgroup without any space.
                    // We need to add it to correctly parse the whole thing.
                    subgroupWithousSpaceRegex = /\}([^{\s]+)/g;

                group = group.replace(subgroupWithousSpaceRegex, '} $1');
                // And now remove all subgroups that are not the actual group.
                group = removeGroups(group, '(?!' + groupName + ')');
                // Remove all control words and trim the whitespace at the beginning
                // that could be introduced by preserving space after last subgroup.
                group = CKEDITOR.tools.trim(group.replace(controlWordsRegex, ''));

                // What's left is group content with } at the end.
                return group.replace(/}$/, '');
            }

            function getGroupName(group) {
                var groupNameRegex = /^\{\\(\w+)/,
                    groupName = group.match(groupNameRegex);

                if (!groupName) {
                    return null;
                }

                return groupName[1];
            }
        }

        function getGroups(rtfContent, groupName) {
            var groups = [],
                current,
                from = 0;

            while (current = getGroup(rtfContent, groupName, {
                start: from
            })) {
                from = current.end;

                groups.push(current);
            }

            return groups;
        }

        function getGroup(content, groupName, options = { start: 0 }) {
            // This function is in fact a very primitive RTF parser.
            // It iterates over RTF content and search for the last } in the group
            // by keeping track of how many elements are open using a stack-like method.
            var open = 0,
                // Despite the fact that we search for only one group,
                // the global modifier is used to be able to manipulate
                // the starting index of the search. Without g flag it's impossible.
                startRegex = new RegExp('\\{\\\\' + groupName, 'g'),
                group,
                i,
                current;
            // debugger;
            // options = CKEDITOR.tools.object.merge({
            // 	start: 0
            // }, options || {});

            startRegex.lastIndex = options.start;
            group = startRegex.exec(content);

            if (!group) {
                return null;
            }

            i = group.index;
            current = content[i];

            do {
                // Every group start has format of {\. However there can be some whitespace after { and before /.
                // Additionally we need to filter also curly braces from the content – fortunately they are escaped.
                var isValidGroupStart = current === '{' && getPreviousNonWhitespaceChar(content, i) !== '\\' &&
                    getNextNonWhitespaceChar(content, i) === '\\',
                    isValidGroupEnd = current === '}' && getPreviousNonWhitespaceChar(content, i) !== '\\' &&
                        open > 0;

                if (isValidGroupStart) {
                    open++;
                } else if (isValidGroupEnd) {
                    open--;
                }

                current = content[++i];
            } while (current && open > 0);

            return {
                start: group.index,
                end: i,
                content: content.substring(group.index, i)
            };
        }

        function getPreviousNonWhitespaceChar(content, index) {
            return getNonWhitespaceChar(content, index, -1);
        }

        function getNextNonWhitespaceChar(content, index) {
            return getNonWhitespaceChar(content, index, 1);
        }

        function getNonWhitespaceChar(content, startIndex, direction) {
            var index = startIndex + direction,
                current = content[index],
                whiteSpaceRegex = /[\s]/;

            while (current && whiteSpaceRegex.test(current)) {
                index = index + direction;
                current = content[index];
            }

            return current;
        }

        function removeGroups(rtfContent, groupName) {
            var current;

            while (current = getGroup(rtfContent, groupName)) {
                var beforeContent = rtfContent.substring(0, current.start),
                    afterContent = rtfContent.substring(current.end);

                rtfContent = beforeContent + afterContent;
            }

            return rtfContent;
        }

    }