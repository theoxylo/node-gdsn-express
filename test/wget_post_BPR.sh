#!/bin/sh

# Go to this script's directory
cd `dirname "$0"`

wget --header="Content-type: multipart/form-data boundary=FILEUPLOAD" --post-file msg_samples/01_BPR_4243444546475_add.xml http://test:testAdmin@localhost:8080/cs_api/1.0/msg --auth-no-challenge
