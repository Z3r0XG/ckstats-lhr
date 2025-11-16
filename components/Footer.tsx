import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="footer footer-center p-4 sm:p-6 bg-base-200 text-base-content rounded">
      <div>
        <p>
          Running Modified Version of{' '}
          <a href="https://github.com/mrv777/ckstats">CKStats</a>: Always free,
          always open source.
        </p>
        <p className="break-all">
          HeliosPool Donations: bc1qryh7hv7quzceehet75udcta0u6lkm4hjvrt9mw
        </p>
      </div>
    </footer>
  );
};

export default Footer;
