import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="footer footer-center p-4 sm:p-6 bg-base-200 text-base-content rounded">
      <div className="flex flex-col items-center gap-2">
        <p className="break-all">
          Donations:{' '}
          <a
            href="bitcoin:bc1q8qkesw5kyplv7hdxyseqls5m78w5tqdfd40lf5"
            className="link text-primary"
          >
            bc1q8qkesw5kyplv7hdxyseqls5m78w5tqdfd40lf5
          </a>
          <p>
            Running Modified Version of CKStats (ckstats-lhr): Always free,
            always open source.
          </p>
        </p>
        <p>
          <a
            href="https://github.com/Z3r0XG/ckstats-lhr"
            target="_blank"
            rel="noopener noreferrer"
            className="link inline-flex items-center gap-1 whitespace-nowrap"
            aria-label="CKStats (modified) repository"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.263.82-.583 0-.288-.01-1.05-.016-2.06-3.338.726-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.757-1.333-1.757-1.09-.745.083-.73.083-.73 1.205.085 1.84 1.237 1.84 1.237 1.07 1.835 2.807 1.305 3.492.997.108-.775.418-1.305.762-1.605-2.665-.305-5.467-1.333-5.467-5.93 0-1.31.468-2.382 1.235-3.222-.123-.303-.535-1.527.117-3.176 0 0 1.008-.322 3.3 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.29-1.552 3.296-1.23 3.296-1.23.653 1.649.242 2.873.12 3.176.77.84 1.233 1.913 1.233 3.222 0 4.61-2.807 5.624-5.48 5.92.43.37.823 1.096.823 2.21 0 1.596-.015 2.882-.015 3.273 0 .322.216.699.824.58C20.565 21.796 24 17.298 24 12c0-6.63-5.373-12-12-12z" />
            </svg>
          </a>
        </p>
      </div>
    </footer>
  );
};

export default Footer;
