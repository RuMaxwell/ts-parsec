const json = {
  object: token('{').next(json.attributes).next(token('}')).eof(),
  attributes: optional(json.attribute.token(',').next(json.attributes)),
  attribute: token('string').next(token(':')).next(json.object)
}
