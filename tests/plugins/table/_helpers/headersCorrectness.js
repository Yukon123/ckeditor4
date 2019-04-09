/* exported assertHeadersCorrectnesssAfterManipulation */

function assertHeadersCorrectnesssAfterManipulation( input, expected, headerType ) {
	'use strict';

	return function() {
		var bot = bender.editorBots.editor;
		bot.setHtmlWithSelection( bender.tools.getValueAsHtml( input ).replace( ';', '' ) );

		bot.dialog( 'tableProperties', function( dialog ) {
			dialog.setValueOf( 'info', 'selHeaders', headerType );

			dialog.fire( 'ok' );
			dialog.hide();

			var exp = bender.tools.getValueAsHtml( expected ).replace( ';', '' );

			assert.beautified.html( exp.replace( '^', '' ),
				bender.tools.fixHtml( dialog.getParentEditor().getData() ).replace( ';', '' ) );
		} );
	};
}
