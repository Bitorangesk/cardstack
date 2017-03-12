async function currentVersion(request, url) {
  let response = await request.get(url);
  expect(response).has.property('status', 200);
  expect(response).has.deep.property('body.data.meta.version');
  let { version } = response.body.data.meta;
  return version;
}

exports.currentVersion = currentVersion;
