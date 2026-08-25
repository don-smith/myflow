#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PluginKind {
    Documents,
    Notes,
}

pub fn required_capability(kind: PluginKind) -> &'static str {
    match kind {
        PluginKind::Documents => "file:write",
        PluginKind::Notes => "file:write",
    }
}
