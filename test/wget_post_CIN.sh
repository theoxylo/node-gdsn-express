#!/bin/sh

# Go to this script's directory
cd `dirname "$0"`

wget --header="Content-type: multipart/form-data boundary=FILEUPLOAD" --post-file CIN_samples/CIN_IN_1242342_20019320017753.xml http://test:testAdmin@localhost:8080/cs_api/1.0/msg --auth-no-challenge
