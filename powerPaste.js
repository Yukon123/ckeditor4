function imagePasteFilters(html, editor, rtf) {
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
        return handleRtfImages(html, rtf, imgTags);
    }

    return handleBlobImages(editor, html, imgTags);


    function extractTagsFromHtml(html) {
        var regexp = /<img[^>]+src="([^"]+)[^>]+/g,
            ret = [],
            item;

        while (item = regexp.exec(html)) {
            ret.push(item[1]);
        }

        return ret;
    }
};

/* 处理八进制富文本数据图片 */
function handleRtfImages(html, rtf, imgTags) {
    var hexImages = extractFromRtf(rtf),
        newSrcValues,
        i;

    if (hexImages.length === 0) {
        return html;
    }

    newSrcValues = CKEDITOR.tools.array.map(hexImages, function (img) {
        return createSrcWithBase64(img);
    }, this);

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
}


function extractFromRtf( rtfContent ) {
    var filter = CKEDITOR.plugins.pastetools.filters.common.rtf,
        ret = [],
        wholeImages;

    // Remove headers, footers, non-Word images and drawn objects.
    // Headers and footers are in \header* and \footer* groups,
    // non-Word images are inside \nonshp groups.
    // Drawn objects are inside \shprslt and could be e.g. image alignment.
    rtfContent = filter.removeGroups( rtfContent, '(?:(?:header|footer)[lrf]?|nonshppict|shprslt)' );
    wholeImages = filter.getGroups( rtfContent, 'pict' );

    if ( !wholeImages ) {
        return ret;
    }

    for ( var i = 0; i < wholeImages.length; i++ ) {
        var currentImage = wholeImages[ i ].content,
            imageId = getImageId( currentImage ),
            imageType = getImageType( currentImage ),
            imageDataIndex = getImageIndex( imageId ),
            isAlreadyExtracted = imageDataIndex !== -1 && ret[ imageDataIndex ].hex,
            // If the same image is inserted more then once, the same id is used.
            isDuplicated = isAlreadyExtracted && ret[ imageDataIndex ].type === imageType,
            // Sometimes image is duplicated with another format, especially if
            // it's right after the original one (so, in other words, original is the last image extracted).
            isAlternateFormat = isAlreadyExtracted && ret[ imageDataIndex ].type !== imageType &&
                imageDataIndex === ret.length - 1,
            // WordArt shapes are defined using \defshp control word. Thanks to that
            // they can be easily filtered.
            isWordArtShape = currentImage.indexOf( '\\defshp' ) !== -1,
            isSupportedType = CKEDITOR.tools.array.indexOf( CKEDITOR.pasteFilters.image.supportedImageTypes, imageType ) !== -1,
            isHorizontalLine = CKEDITOR.tools.indexOf( currentImage, 'fHorizRule' ) !== -1;

        if ( isDuplicated ) {
            ret.push( ret[ imageDataIndex ] );

            continue;
        }

        if ( isAlternateFormat || isWordArtShape ) {
            continue;
        }

        // Continue when the element is a <hr> line to allow paste image with horizontal line. (#4873)
        if ( isHorizontalLine ) {
            continue;
        }

        var newImageData = {
            id: imageId,
            hex: isSupportedType ? getImageContent( currentImage ) : null,
            type: imageType
        };

        if ( imageDataIndex !== -1 ) {
            ret.splice( imageDataIndex, 1, newImageData );
        } else {
            ret.push( newImageData );
        }
    }

    return ret;

    function getImageIndex( id ) {
        // In some cases LibreOffice does not include ids for images.
        // In that case, always treat them as unique (not found in the array).
        if ( typeof id !== 'string' ) {
            return -1;
        }

        return CKEDITOR.tools.array.indexOf( ret, function( image ) {
            return image.id === id;
        } );
    }

    function getImageId( image ) {
        var blipUidRegex = /\\blipuid (\w+)\}/,
            blipTagRegex = /\\bliptag(-?\d+)/,
            blipUidMatch = image.match( blipUidRegex ),
            blipTagMatch = image.match( blipTagRegex );

        if ( blipUidMatch ) {
            return blipUidMatch[ 1 ];
        } else if ( blipTagMatch ) {
            return blipTagMatch[ 1 ];
        }

        return null;
    }

    // Image content is basically \pict group content. However RTF sometimes
    // break content into several lines and we don't want any whitespace
    // in our images. So we need to get rid of it.
    function getImageContent( image ) {
        var content = filter.extractGroupContent( image );
        debugger;
        return content.replace( /\s/g, '' );
    }
}


plug.rtf = {
    /**
     * Get all groups from the RTF content with the given name.
     *
     * ```js
     * var rtfContent = '{\\rtf1\\some\\control\\words{\\group content}{\\group content}{\\whatever {\\subgroup content}}}',
     * 	groups = CKEDITOR.plugins.pastetools.filters.common.rtf.getGroups( rtfContent, '(group|whatever)' );
     *
     * console.log( groups );
     *
     * // Result of the console.log:
     * // [
     * // 	{"start":25,"end":41,"content":"{\\group content}"},
     * // 	{"start":41,"end":57,"content":"{\\group content}"},
     * // 	{"start":57,"end":88,"content":"{\\whatever {\\subgroup content}}"}
     * // ]
     * ```
     *
     * @private
     * @since 4.16.0
     * @param {String} rtfContent
     * @param {String} groupName Group name to find. It can be a regex-like string.
     * @returns {CKEDITOR.plugins.pastetools.filters.common.rtf.GroupInfo[]}
     * @member CKEDITOR.plugins.pastetools.filters.common.rtf
     */
    getGroups: function( rtfContent, groupName ) {
        var groups = [],
            current,
            from = 0;

        while ( current = plug.rtf.getGroup( rtfContent, groupName, {
            start: from
        } ) ) {
            from = current.end;

            groups.push( current );
        }

        return groups;
    },

    /**
     * Remove all groups from the RTF content with the given name.
     *
     * ```js
     * var rtfContent = '{\\rtf1\\some\\control\\words{\\group content}{\\group content}{\\whatever {\\subgroup content}}}',
     * 	rtfWithoutGroups = CKEDITOR.plugins.pastetools.filters.common.rtf.removeGroups( rtfContent, '(group|whatever)' );
     *
     * console.log( rtfWithoutGroups ); // {\rtf1\some\control\words}
     * ```
     *
     * @private
     * @since 4.16.0
     * @param {String} rtfContent
     * @param {String} groupName Group name to find. It can be a regex-like string.
     * @returns {String} RTF content without the removed groups.
     * @member CKEDITOR.plugins.pastetools.filters.common.rtf
     */
    removeGroups: function( rtfContent, groupName ) {
        var current;

        while ( current = plug.rtf.getGroup( rtfContent, groupName ) ) {
            var beforeContent = rtfContent.substring( 0, current.start ),
                afterContent = rtfContent.substring( current.end );

            rtfContent = beforeContent + afterContent;
        }

        return rtfContent;
    },

    /**
     * Get the group from the RTF content with the given name.
     *
     * Groups are recognized thanks to being in `{\<name>}` format.
     *
     * ```js
     * var rtfContent = '{\\rtf1\\some\\control\\words{\\group content1}{\\group content2}{\\whatever {\\subgroup content}}}',
     * 	firstGroup = CKEDITOR.plugins.pastetools.filters.common.rtf.getGroup( rtfContent, '(group|whatever)' ),
     * 	lastGroup = CKEDITOR.plugins.pastetools.filters.common.rtf.getGroup( rtfContent, '(group|whatever)', {
     * 		start: 50
     * 	} );
     *
     * console.log( firstGroup ); // {"start":25,"end":42,"content":"{\\group content1}"}
     * console.log( lastGroup ); // {"start":59,"end":90,"content":"{\\whatever {\\subgroup content}}"}
     * ```
     *
     * @private
     * @since 4.16.0
     * @param {String} content RTF content.
     * @param {String} groupName Group name to find. It can be a regex-like string.
     * @param {Object} options Additional options.
     * @param {Number} options.start String index on which the search should begin.
     * @returns {CKEDITOR.plugins.pastetools.filters.common.rtf.GroupInfo}
     * @member CKEDITOR.plugins.pastetools.filters.common.rtf
     */
    getGroup: function( content, groupName, options ) {
        // This function is in fact a very primitive RTF parser.
        // It iterates over RTF content and search for the last } in the group
        // by keeping track of how many elements are open using a stack-like method.
        var open = 0,
            // Despite the fact that we search for only one group,
            // the global modifier is used to be able to manipulate
            // the starting index of the search. Without g flag it's impossible.
            startRegex = new RegExp( '\\{\\\\' + groupName, 'g' ),
            group,
            i,
            current;

        options = CKEDITOR.tools.object.merge( {
            start: 0
        }, options || {} );

        startRegex.lastIndex = options.start;
        group = startRegex.exec( content );

        if ( !group ) {
            return null;
        }

        i = group.index;
        current = content[ i ];

        do {
            // Every group start has format of {\. However there can be some whitespace after { and before /.
            // Additionally we need to filter also curly braces from the content – fortunately they are escaped.
            var isValidGroupStart = current === '{' && getPreviousNonWhitespaceChar( content, i ) !== '\\' &&
                getNextNonWhitespaceChar( content, i ) === '\\',
                isValidGroupEnd = current === '}' && getPreviousNonWhitespaceChar( content, i ) !== '\\' &&
                    open > 0;

            if ( isValidGroupStart ) {
                open++;
            } else if ( isValidGroupEnd ) {
                open--;
            }

            current = content[ ++i ];
        } while ( current && open > 0 );

        return {
            start: group.index,
            end: i,
            content: content.substring( group.index, i )
        };
    },

    /**
     * Get group content.
     *
     * The content starts with the first character that is not a part of
     * control word or subgroup.
     *
     * ```js
     * var group = '{\\group{\\subgroup subgroupcontent} group content}',
     * 	groupContent = CKEDITOR.plugins.pastetools.filters.common.rtf.extractGroupContent( group );
     *
     * console.log( groupContent ); // "group content"
     * ```
     *
     * @private
     * @since 4.16.0
     * @param {String} group Whole group string.
     * @returns {String} Extracted group content.
     * @member CKEDITOR.plugins.pastetools.filters.common.rtf
     */
    /* 提取组数据 */
    extractGroupContent: function( group ) {
        debugger;
        var groupName = getGroupName( group ),
            controlWordsRegex = /^\{(\\[\w-]+\s*)+/g,
            // Sometimes content follows the last subgroup without any space.
            // We need to add it to correctly parse the whole thing.
            subgroupWithousSpaceRegex = /\}([^{\s]+)/g;

        group = group.replace( subgroupWithousSpaceRegex, '} $1' );
        // And now remove all subgroups that are not the actual group.
        group = plug.rtf.removeGroups( group, '(?!' + groupName + ')' );
        // Remove all control words and trim the whitespace at the beginning
        // that could be introduced by preserving space after last subgroup.
        group = CKEDITOR.tools.trim( group.replace( controlWordsRegex, '' ) );

        // What's left is group content with } at the end.
        return group.replace( /}$/, '' );
    }
};

