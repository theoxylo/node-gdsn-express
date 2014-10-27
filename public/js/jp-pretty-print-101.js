/*
 AUTHOR James Padolsey (http://james.padolsey.com)
 VERSION 1.01
 UPDATED 06-06-2009
 MINIFIED
 */
var prettyPrint = (function() {
    var n = {
        el : function(a, b) {
            var c = document.createElement(a), attr;
            b = n.merge({}, b);
            if (b && b.style) {
                var d = b.style;
                for ( var f in d) {
                    if (d.hasOwnProperty(f)) {
                        try {
                            c.style[f] = d[f]
                        } catch (e) {
                        }
                    }
                }
                delete b.style
            }
            for (attr in b) {
                if (b.hasOwnProperty(attr)) {
                    c[attr] = b[attr]
                }
            }
            return c
        },
        txt : function(t) {
            return document.createTextNode(t)
        },
        row : function(b, c, d) {
            d = d || 'td';
            var e = n.count(b, null) + 1, tr = n.el('tr'), td, attrs = {
                style : n.getStyles(d, c),
                colSpan : e
            };
            n.forEach(b, function(a) {
                if (a === null) {
                    return
                }
                td = n.el(d, attrs);
                if (a.nodeType) {
                    td.appendChild(a)
                } else {
                    td.innerHTML = n.shorten(a.toString())
                }
                tr.appendChild(td)
            });
            return tr
        },
        hRow : function(a, b) {
            return n.row(a, b, 'th')
        },
        table : function(d, e) {
            d = d || [];
            var f = {
                thead : {
                    style : n.getStyles('thead', e)
                },
                tbody : {
                    style : n.getStyles('tbody', e)
                },
                table : {
                    style : n.getStyles('table', e)
                }
            }, tbl = n.el('table', f.table), thead = n.el('thead', f.thead), tbody = n
                    .el('tbody', f.tbody);
            if (d.length) {
                tbl.appendChild(thead);
                thead.appendChild(n.hRow(d, e))
            }
            tbl.appendChild(tbody);
            return {
                node : tbl,
                tbody : tbody,
                thead : thead,
                appendChild : function(a) {
                    this.tbody.appendChild(a)
                },
                addRow : function(a, b, c) {
                    this.appendChild(n.row.call(n, a, (b || e), c));
                    return this
                }
            }
        },
        shorten : function(a) {
            var maxLength = 1000;
            a = a.replace(/^\s\s*|\s\s*$|\n/g, '');
            return a.length > maxLength ? (a.substring(0, maxLength - 1) + '...') : a
        },
        htmlentities : function(a) {
            return a.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g,
                    '&gt;')
        },
        merge : function(b, c) {
            if (typeof b !== 'object') {
                b = {}
            }
            for ( var d in c) {
                if (c.hasOwnProperty(d)) {
                    var e = c[d];
                    if (typeof e === 'object') {
                        b[d] = n.merge(b[d], e);
                        continue
                    }
                    b[d] = e
                }
            }
            for ( var a = 2, l = arguments.length; a < l; a++) {
                n.merge(b, arguments[a])
            }
            return b
        },
        count : function(a, b) {
            var c = 0;
            for ( var i = 0, l = a.length; i < l; i++) {
                if (a[i] === b) {
                    c++
                }
            }
            return c
        },
        thead : function(a) {
            return a.getElementsByTagName('thead')[0]
        },
        forEach : function(a, b) {
            var c = a.length, index = -1;
            while (c > ++index) {
                if (b(a[index], index, a) === false) {
                    break
                }
            }
            return true
        },
        type : function(v) {
            try {
                if (v === null) {
                    return 'null'
                }
                if (v === undefined) {
                    return 'undefined'
                }
                var a = Object.prototype.toString.call(v).match(/\s(.+?)\]/)[1]
                        .toLowerCase();
                if (v.nodeType) {
                    if (v.nodeType === 1) {
                        return 'domelement'
                    }
                    return 'domnode'
                }
                if (/^(string|number|array|regexp|function|date|boolean)$/
                        .test(a)) {
                    return a
                }
                if (typeof v === 'object') {
                    return 'object'
                }
                if (v === window || v === document) {
                    return 'object'
                }
                return 'default'
            } catch (e) {
                return 'default'
            }
        },
        within : function(a) {
            return {
                is : function(o) {
                    for ( var i in a) {
                        if (a[i] === o) {
                            return i
                        }
                    }
                    return ''
                }
            }
        },
        common : {
            circRef : function(a, b, c) {
                return n.expander('[POINTS BACK TO <strong>' + (b)
                        + '</strong>]', 'Click to show this item anyway',
                        function() {
                            this.parentNode.appendChild(p(a, {
                                maxDepth : 1
                            }))
                        })
            },
            depthReached : function(a, b) {
                return n
                        .expander(
                                '[DEPTH REACHED]',
                                'Click to show this item anyway',
                                function() {
                                    try {
                                        this.parentNode.appendChild(p(a, {
                                            maxDepth : 1
                                        }))
                                    } catch (e) {
                                        this.parentNode
                                                .appendChild(n
                                                        .table(
                                                                [ 'ERROR OCCURED DURING OBJECT RETRIEVAL' ],
                                                                'error')
                                                        .addRow([ e.message ]).node)
                                    }
                                })
            }
        },
        getStyles : function(a, b) {
            b = p.settings.styles[b] || {};
            return n.merge({}, p.settings.styles['default'][a], b[a])
        },
        expander : function(a, b, c) {
            return n
                    .el(
                            'a',
                            {
                                innerHTML : n.shorten(a)
                                        + ' <b style="visibility:hidden;">[+]</b>',
                                title : b,
                                onmouseover : function() {
                                    this.getElementsByTagName('b')[0].style.visibility = 'visible'
                                },
                                onmouseout : function() {
                                    this.getElementsByTagName('b')[0].style.visibility = 'hidden'
                                },
                                onclick : function() {
                                    this.style.display = 'none';
                                    c.call(this);
                                    return false
                                },
                                style : {
                                    cursor : 'pointer'
                                }
                            })
        },
        stringify : function(b) {
            var c = n.type(b), str, first = true;
            if (c === 'array') {
                str = '[';
                n.forEach(b, function(a, i) {
                    str += (i === 0 ? '' : ', ') + n.stringify(a)
                });
                return str + ']'
            }
            if (typeof b === 'object') {
                str = '{';
                for ( var i in b) {
                    if (b.hasOwnProperty(i)) {
                        str += (first ? '' : ', ') + i + ':'
                                + n.stringify(b[i]);
                        first = false
                    }
                }
                return str + '}'
            }
            if (c === 'regexp') {
                return '/' + b.source + '/'
            }
            if (c === 'string') {
                return '"' + b.replace(/"/g, '\\"') + '"'
            }
            return b.toString()
        },
        headerGradient : (function() {
            var a = document.createElement('canvas');
            if (!a.getContext) {
                return ''
            }
            var b = a.getContext('2d');
            a.height = 30;
            a.width = 1;
            var c = b.createLinearGradient(0, 0, 0, 30);
            c.addColorStop(0, 'rgba(0,0,0,0)');
            c.addColorStop(1, 'rgba(0,0,0,0.25)');
            b.fillStyle = c;
            b.fillRect(0, 0, 1, 30);
            var d = a.toDataURL && a.toDataURL();
            return 'url(' + (d || '') + ')'
        })()
    };
    var p = function(j, k) {
        k = k || {};
        var l = n.merge({}, p.config, k), container = n.el('div'), config = p.config, currentDepth = 0, stack = {}, hasRunOnce = false;
        p.settings = l;
        var m = {
            string : function(a) {
                return n.txt('"' + n.shorten(a.replace(/"/g, '\\"')) + '"')
            },
            number : function(a) {
                return n.txt(a)
            },
            regexp : function(a) {
                var b = n.table([ 'RegExp', null ], 'regexp');
                var c = n.table();
                var d = n.expander('/' + a.source + '/', 'Click to show more',
                        function() {
                            this.parentNode.appendChild(b.node)
                        });
                c.addRow([ 'g', a.global ]).addRow([ 'i', a.ignoreCase ])
                        .addRow([ 'm', a.multiline ]);
                b.addRow([ 'source', '/' + a.source + '/' ]).addRow(
                        [ 'flags', c.node ]).addRow(
                        [ 'lastIndex', a.lastIndex ]);
                return l.expanded ? b.node : d
            },
            domelement : function(b, c) {
                var d = n.table([ 'DOMElement', null ], 'domelement'), props = [
                        'id', 'className', 'innerHTML' ];
                d.addRow([ 'tag', '&lt;' + b.nodeName.toLowerCase() + '&gt;' ]);
                n.forEach(props, function(a) {
                    if (b[a]) {
                        d.addRow([ a, n.htmlentities(b[a]) ])
                    }
                });
                return l.expanded ? d.node : n.expander('DOMElement ('
                        + b.nodeName.toLowerCase() + ')', 'Click to show more',
                        function() {
                            this.parentNode.appendChild(d.node)
                        })
            },
            domnode : function(a) {
                var b = n.table([ 'DOMNode', null ], 'domelement'), data = n
                        .htmlentities((a.data || 'UNDEFINED').replace(/\n/g,
                                '\\n'));
                b.addRow([ 'nodeType', a.nodeType + ' (' + a.nodeName + ')' ])
                        .addRow([ 'data', data ]);
                return l.expanded ? b.node : n.expander('DOMNode',
                        'Click to show more', function() {
                            this.parentNode.appendChild(b.node)
                        })
            },
            object : function(a, b, c) {
                var d = n.within(stack).is(a);
                if (d) {
                    return n.common.circRef(a, d, l)
                }
                stack[c || 'TOP'] = a;
                if (b === l.maxDepth) {
                    return n.common.depthReached(a, l)
                }
                var f = n.table([null], 'object'), isEmpty = true;
                //var f = n.table([ 'Object', null ], 'object'), isEmpty = true;
                for ( var i in a) {
                    if (!a.hasOwnProperty || a.hasOwnProperty(i)) {
                        var g = a[i], type = n.type(g);
                        isEmpty = false;
                        try {
                            f.addRow([ i, m[type](g, b + 1, i) ], type)
                        } catch (e) {
                            if (window.console && window.console.log) {
                                console.log(e.message)
                            }
                        }
                    }
                }
                /*
                if (isEmpty) {
                    f.addRow([ '<small>[empty]</small>' ])
                } else {
                    f.thead
                            .appendChild(n
                                    .hRow([ 'key', 'value' ], 'colHeader'))
                }
                */
                var h = (l.expanded || hasRunOnce) ? f.node : n.expander(n
                        .stringify(a), 'Click to show more', function() {
                    this.parentNode.appendChild(f.node)
                });
                hasRunOnce = true;
                return h
            },
            array : function(b, c, d) {
                var e = n.within(stack).is(b);
                if (e) {
                    return n.common.circRef(b, e)
                }
                stack[d || 'TOP'] = b;
                if (c === l.maxDepth) {
                    return n.common.depthReached(b)
                }
                var f = n.table([ null ], 'array'), isEmpty = true;
                //var f = n.table([ 'Array(' + b.length + ')', null ], 'array'), isEmpty = true;
                n.forEach(b, function(a, i) {
                    isEmpty = false;
                    f.addRow([ i, m[n.type(a)](a, c + 1, i) ])
                });
                /*
                if (isEmpty) {
                    f.addRow([ '<small>[empty]</small>' ])
                } else {
                    f.thead.appendChild(n.hRow([ 'index', 'value' ],
                            'colHeader'))
                }
                */
                return l.expanded ? f.node : n.expander(n.stringify(b),
                        'Click to show more', function() {
                            this.parentNode.appendChild(f.node)
                        })
            },
            'function' : function(a, b, c) {
                var d = n.within(stack).is(a);
                if (d) {
                    return n.common.circRef(a, d)
                }
                stack[c || 'TOP'] = a;
                var e = n.table([ 'Function', null ], 'function'), span = n
                        .el(
                                'span',
                                {
                                    innerHTML : 'function(){...} <b style="visibility:hidden;">[+]</b>',
                                    onmouseover : function() {
                                        this.getElementsByTagName('b')[0].style.visibility = 'visible'
                                    },
                                    onmouseout : function() {
                                        this.getElementsByTagName('b')[0].style.visibility = 'hidden'
                                    },
                                    onclick : function() {
                                        this.style.display = 'none';
                                        this.parentNode.appendChild(e.node)
                                    },
                                    style : {
                                        cursor : 'pointer'
                                    }
                                }), argsTable = n.table([ 'Arguments' ]), args = a
                        .toString().match(/\((.+?)\)/), body = a.toString()
                        .match(/\{([\S\s]+)/)[1].replace(/\}$/, '');
                e.addRow(
                        [
                                'arguments',
                                args ? args[1].replace(/[^\w_,\s]/g, '')
                                        : '<small>[none/native]</small>' ])
                        .addRow([ 'body', body ]);
                return l.expanded ? e.node : span
            },
            'date' : function(a) {
                var b = n.table([ 'Date', null ], 'date');
                var c = n
                        .el(
                                'span',
                                {
                                    innerHTML : (+a)
                                            + ' <b style="visibility:hidden;">[+]</b>',
                                    onmouseover : function() {
                                        this.getElementsByTagName('b')[0].style.visibility = 'visible'
                                    },
                                    onmouseout : function() {
                                        this.getElementsByTagName('b')[0].style.visibility = 'hidden'
                                    },
                                    onclick : function() {
                                        this.style.display = 'none';
                                        this.parentNode.appendChild(b.node)
                                    },
                                    style : {
                                        cursor : 'pointer'
                                    }
                                });
                a = a.toString().split(/\s/);
                b.addRow([ 'Time', a[4] ]).addRow(
                        [ 'Date', a.slice(0, 4).join('-') ]);
                return l.expanded ? b.node : c
            },
            'boolean' : function(a) {
                return n.txt(a.toString().toUpperCase())
            },
            'undefined' : function() {
                return n.txt('UNDEFINED')
            },
            'null' : function() {
                return n.txt('NULL')
            },
            'default' : function() {
                return n.txt('prettyPrint: TypeNotFound Error')
            }
        };
        container.appendChild(m[(l.forceObject) ? 'object' : n.type(j)](j,
                currentDepth));
        return container
    };
    p.config = {
        expanded : true,
        forceObject : false,
        maxDepth : 1000,
        styles : {
            array : {
                th : {
                    backgroundColor : '#6DBD2A',
                    color : 'white'
                }
            },
            'function' : {
                th : {
                    backgroundColor : '#D82525'
                }
            },
            regexp : {
                th : {
                    backgroundColor : '#E2F3FB',
                    color : '#000'
                }
            },
            object : {
                th : {
                    backgroundColor : '#1F96CF'
                }
            },
            error : {
                th : {
                    backgroundColor : 'red',
                    color : 'yellow'
                }
            },
            domelement : {
                th : {
                    backgroundColor : '#F3801E'
                }
            },
            date : {
                th : {
                    backgroundColor : '#A725D8'
                }
            },
            colHeader : {
                th : {
                    backgroundColor : '#EEE',
                    color : '#000',
                    textTransform : 'uppercase'
                }
            },
            'default' : {
                table : {
                    borderCollapse : 'collapse',
                    width : '100%'
                },
                td : {
                    padding : '5px',
                    fontSize : '12px',
                    backgroundColor : '#FFF',
                    color : '#222',
                    border : '1px solid #000',
                    verticalAlign : 'top',
                    fontFamily : '"Consolas","Lucida Console",Courier,mono',
                    /* whiteSpace : 'nowrap' */
                },
                th : {
                    padding : '5px',
                    fontSize : '12px',
                    backgroundColor : '#222',
                    color : '#EEE',
                    textAlign : 'left',
                    border : '1px solid #000',
                    verticalAlign : 'top',
                    fontFamily : '"Consolas","Lucida Console",Courier,mono',
                    backgroundImage : n.headerGradient,
                    backgroundRepeat : 'repeat-x'
                }
            }
        }
    };
    return p
})();
