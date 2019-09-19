class Id3Reader
{
    constructor(url) {
        this.url = url;

        this.buffer = null;
        this.byteArray = [];
        this.id3Size = 0;
        this.tags = {};

        this.frames = {
            'TYER': 'year',
            'TPE1': 'artist',
            'TALB': 'album',
            'TIT2': 'title',
            'TLAN': 'language',
            'TRCK': 'trackNumber',
            'TCON': 'genre',
            'APIC': 'albumCover',
            'TCOP': 'copyright',
            'WCOP': 'copyrightPageUrl',
            'COMM': 'comments',
        };
    }
    
    async getAllTags() {
        try {
            await this.loadMetaData();
        } catch (error) {
            // Do nothing
            return;
        }
        
        // Is there an ID3 tags block at all?
        if (!this._hasId3Tags()) {
            return;
        }
        
        // ID3 major version. We're support only v2.3 up for now.
        // NOTE: There are slight differences between  v2.3 & v2.4 which we
        // don't consider for now as well
        if (this._getId3MajorVersion() < 3) {
            return;
        }

        this.id3Size = new DataView(this.buffer.slice(6, 10)).getInt32();

        // Determine where the actual tags start from
        const id3Start = this._headerIsExtended()
            ? 10 + new DataView(this.buffer.slice(10, 14)).getInt32()
            : 10;

        return new Promise((resolve, reject) => {
            fetch(this.url, {
                method: 'GET',
                headers: {
                    Range: `bytes=${id3Start}-${this.id3Size}`
                }
            })
            .then(response => response.arrayBuffer())
            .then(data => {
                this.buffer = data;
                this.byteArray = new Uint8Array(data);

                this._readTags();

                console.log(this.tags);
                resolve(this.tags);
            });
        });
    }

    /**
     * Load first 10 bytes of the file to determine whether it has id3 tags and
     * if it does - what is the id3 block size
     */
    async loadMetaData() {
        await fetch(this.url, {
            method: 'GET',
            headers: {
                Range: 'bytes=0-13'
            }
        })
        .then(response => response.arrayBuffer())
        .then(data => {
            this.buffer = data;
            this.byteArray = new Uint8Array(data);
        });
    }

    _slice(from, length) {
        return this.byteArray.slice(from, from + length);
    }

    _sliceToString(from, length) {
        return (new TextDecoder()).decode(this._slice(from, length));
    }

    _readTags() {
        let offset = 0;

        // Read all the tags one by one, extract the ones we need
        while (offset < this.id3Size) {
            try {
                // this._readTags();
                offset = this._readTag(offset);
            } catch (error) {
                // Do nothing
                offset += this.id3Size;
            }
        }
    }

    _hasId3Tags() {
        // If the first 3 bytes are not 'ID3' - there's no ID3 data in the file
        return this._sliceToString(0, 3) === 'ID3';
    }

    _getId3MajorVersion() {
        // The ID3 major version is stored in the 4th byte
        return this._slice(3, 1)[0];
    }

    _headerIsExtended() {
        // The 4 first bits of the 6th byte contain flags (1 bit = 1 flag true
        // or false)
        const flags = this._slice(5, 1)[0].toString(2);

        if (flags.length == 8) {
            return flags[1] === '1';
        }
        
        if (flags.length == 7) {
            return flags[0] === '1';
        }

        return false;
    }

    _readTag(offset) {
        const type = this._sliceToString(offset, 4);
        offset += 4;

        const frameSize = new DataView(this.buffer.slice(offset, offset + 4)).getInt32();
        offset += 4;
        
        // TODO: See the "4.1.   Frame header flags" section at
        // http://id3.org/id3v2.4.0-structure on how to handle the frame flags
        const flags = this._slice(offset, 2);
        offset += 2;

        // Each value starts with a weird character. From StackOverflow: "The
        // character at the beginning may be U+FEFF Byte Order Mark, which is
        // used to distinguish between UTF-16LE and UTF-16BE". So, we're gonna
        // ignore it.
        const value = this._sliceToString(offset + 1, frameSize - 1);
        offset += frameSize;

        if (this.frames[type]) {
            this.tags[this.frames[type]] = value;
        }

        return offset;
    }
}

export default Id3Reader;