use regex::Regex;
use std::sync::OnceLock;

/// Extract year from folder-name patterns like "(1999)", "[1999]", or "- 1999"
pub fn extract_year(name: &str) -> Option<i32> {
    static YEAR_RE: OnceLock<Regex> = OnceLock::new();
    let re = YEAR_RE.get_or_init(|| {
        Regex::new(r"[\(\[]\s*(\d{4})\s*[\)\]]|[-\x{2013}\x{2014}]\s*(\d{4})\s*$").unwrap()
    });

    re.captures(name).and_then(|caps| {
        let y_str = caps.get(1).or_else(|| caps.get(2))?.as_str();
        let y = y_str.parse::<i32>().ok()?;
        if (1900..=2100).contains(&y) {
            Some(y)
        } else {
            None
        }
    })
}

/// Hash a password using bcrypt with spawn_blocking (cost = 12).
pub async fn hash_password(password: String) -> Result<String, crate::error::AppError> {
    tokio::task::spawn_blocking(move || bcrypt::hash(password, 12))
        .await
        .map_err(|e| crate::error::AppError::Internal(format!("Task error: {}", e)))?
        .map_err(|e| crate::error::AppError::Internal(format!("Bcrypt error: {}", e)))
}

/// Verify a password against a bcrypt hash with spawn_blocking.
pub async fn verify_password(password: String, hash: String) -> Result<bool, crate::error::AppError> {
    tokio::task::spawn_blocking(move || bcrypt::verify(password, &hash).unwrap_or(false))
        .await
        .map_err(|e| crate::error::AppError::Internal(format!("Task error: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_year_parens() {
        assert_eq!(extract_year("Naruto (1999)"), Some(1999));
        assert_eq!(extract_year("One Punch Man (2012)"), Some(2012));
    }

    #[test]
    fn extract_year_brackets() {
        assert_eq!(extract_year("Naruto [1999]"), Some(1999));
    }

    #[test]
    fn extract_year_dash() {
        assert_eq!(extract_year("Naruto - 2005"), Some(2005));
    }

    #[test]
    fn extract_year_none() {
        assert_eq!(extract_year("Just A Name"), None);
        assert_eq!(extract_year(""), None);
    }

    #[test]
    fn extract_year_out_of_range() {
        assert_eq!(extract_year("Old (1800)"), None);
        assert_eq!(extract_year("Future (2200)"), None);
    }

    #[test]
    fn extract_year_boundary_valid() {
        assert_eq!(extract_year("Min (1900)"), Some(1900));
        assert_eq!(extract_year("Max (2100)"), Some(2100));
    }
}
